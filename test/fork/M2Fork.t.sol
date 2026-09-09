// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface Vm {
    function envString(string calldata) external returns (string memory);
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function createSelectFork(string calldata, uint256) external returns (uint256);
    function deal(address token, address to, uint256 amount, bool adjust) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IERC4626 {
    function asset() external view returns (address);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function maxDeposit(address receiver) external view returns (uint256);
    function maxMint(address receiver) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract M2ForkTest {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256[3] private amounts = [uint256(1_000e6), uint256(10_000e6), uint256(100_000e6)];

    function _fork() private {
        VM.createSelectFork(VM.envString("ETHEREUM_MAINNET_RPC_URL"), VM.envUint("POA_M2_FORK_BLOCK"));
    }

    function _approve(address token, address spender, uint256 amount) private {
        IERC20(token).approve(spender, 0);
        require(IERC20(token).approve(spender, amount), "APPROVE_FAILED");
    }

    function testAaveUsdcSupplyWithdrawAllAmounts() external {
        for (uint256 i; i < amounts.length; ++i) {
            _fork();
            address usdc = VM.envAddress("POA_USDC");
            address pool = VM.envAddress("POA_AAVE_POOL");
            address aToken = VM.envAddress("POA_AAVE_USDC_ATOKEN");
            require(IERC20(usdc).decimals() == 6, "USDC_SCALE");
            VM.deal(usdc, address(this), amounts[i], true);
            _approve(usdc, pool, amounts[i]);
            IAavePool(pool).supply(usdc, amounts[i], address(this), 0);
            uint256 supplied = IERC20(aToken).balanceOf(address(this));
            require(supplied >= amounts[i] - 1 && supplied <= amounts[i] + 1, "AAVE_SUPPLY_ROUNDING");
            uint256 withdrawn = IAavePool(pool).withdraw(usdc, type(uint256).max, address(this));
            require(withdrawn >= amounts[i] - 1, "AAVE_WITHDRAW");
        }
    }

    function testSelectedVaultAllPreviewsLimitsAndRoundTrips() external {
        for (uint256 i; i < amounts.length; ++i) {
            _fork();
            address usdc = VM.envAddress("POA_USDC");
            address vaultAddress = VM.envAddress("POA_ERC4626_VAULT");
            IERC4626 vault = IERC4626(vaultAddress);
            require(vault.asset() == usdc, "VAULT_ASSET");
            require(vault.maxDeposit(address(this)) >= amounts[i], "VAULT_MAX_DEPOSIT");
            uint256 expectedShares = vault.previewDeposit(amounts[i]);
            require(expectedShares > 0 && vault.maxMint(address(this)) >= expectedShares, "VAULT_MAX_MINT");
            require(vault.previewMint(expectedShares) <= amounts[i] + 1, "VAULT_PREVIEW_MINT");
            VM.deal(usdc, address(this), amounts[i], true);
            _approve(usdc, vaultAddress, amounts[i]);
            uint256 shares = vault.deposit(amounts[i], address(this));
            require(shares == expectedShares, "VAULT_DEPOSIT_PREVIEW");
            uint256 assets = vault.previewRedeem(shares);
            require(vault.maxRedeem(address(this)) >= shares, "VAULT_MAX_REDEEM");
            require(vault.maxWithdraw(address(this)) >= assets, "VAULT_MAX_WITHDRAW");
            require(vault.previewWithdraw(assets) <= shares + 1, "VAULT_PREVIEW_WITHDRAW");
            require(vault.redeem(shares, address(this), address(this)) == assets, "VAULT_REDEEM_PREVIEW");
        }
    }

    function testUniswapDirectBothDirectionsAllAmounts() external {
        address[2] memory tokens;
        for (uint256 direction; direction < 2; ++direction) {
            for (uint256 i; i < amounts.length; ++i) {
                _fork();
                tokens[0] = VM.envAddress("POA_USDC");
                tokens[1] = VM.envAddress("POA_USDT");
                require(IERC20(tokens[0]).decimals() == 6 && IERC20(tokens[1]).decimals() == 6, "TOKEN_SCALE");
                address router = VM.envAddress("POA_UNISWAP_V3_ROUTER");
                VM.deal(tokens[direction], address(this), amounts[i], true);
                _approve(tokens[direction], router, amounts[i]);
                uint256 output = ISwapRouter(router).exactInputSingle(ISwapRouter.ExactInputSingleParams({
                    tokenIn: tokens[direction], tokenOut: tokens[1 - direction],
                    fee: uint24(VM.envUint("POA_UNISWAP_USDC_USDT_FEE")), recipient: address(this),
                    deadline: block.timestamp, amountIn: amounts[i], amountOutMinimum: 1, sqrtPriceLimitX96: 0
                }));
                require(output > 0 && IERC20(tokens[1 - direction]).balanceOf(address(this)) == output, "SWAP_OUTPUT");
            }
        }
    }
}
