// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Test-only ERC-4626 vault. Yield is a finite token budget funded and
/// frozen before the experiment; unvested tokens are excluded from totalAssets.
contract FiniteYieldVault {
    string public constant name = "Proof of Alpha Finite Test Vault";
    string public constant symbol = "poaTV";
    uint8 public constant decimals = 6;
    IERC20Like public immutable asset;
    address public immutable scheduleOwner;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public scheduleFrozen;
    uint64 public yieldStart;
    uint64 public yieldEnd;
    uint256 public yieldBudget;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares
    );
    event YieldScheduleFrozen(uint64 start, uint64 end, uint256 fundedBudget);

    constructor(address asset_, address owner_) {
        require(asset_ != address(0) && owner_ != address(0), "ZERO_ADDRESS");
        asset = IERC20Like(asset_);
        scheduleOwner = owner_;
    }

    function freezeYieldSchedule(uint64 start, uint64 end, uint256 budget) external {
        require(msg.sender == scheduleOwner, "OWNER");
        require(!scheduleFrozen, "FROZEN");
        require(block.timestamp < start && start < end && budget > 0, "SCHEDULE");
        require(asset.transferFrom(msg.sender, address(this), budget), "FUNDING");
        scheduleFrozen = true;
        yieldStart = start;
        yieldEnd = end;
        yieldBudget = budget;
        emit YieldScheduleFrozen(start, end, budget);
    }

    function vestedYield() public view returns (uint256) {
        if (!scheduleFrozen || block.timestamp <= yieldStart) return 0;
        if (block.timestamp >= yieldEnd) return yieldBudget;
        return yieldBudget * (block.timestamp - yieldStart) / (yieldEnd - yieldStart);
    }

    function totalAssets() public view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        uint256 unvested = scheduleFrozen ? yieldBudget - vestedYield() : 0;
        return balance - unvested;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        return supply == 0 || managed == 0 ? assets : assets * supply / managed;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0 ? shares : shares * totalAssets() / supply;
    }

    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares) external view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        if (supply == 0 || managed == 0) return shares;
        return (shares * managed + supply - 1) / supply;
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        if (supply == 0 || managed == 0) return assets;
        return (assets * supply + managed - 1) / managed;
    }

    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    function maxDeposit(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function maxMint(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return convertToAssets(balanceOf[owner]);
    }

    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf[owner];
    }

    function approve(address spender, uint256 shares) external returns (bool) {
        allowance[msg.sender][spender] = shares;
        emit Approval(msg.sender, spender, shares);
        return true;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        require(assets > 0 && shares > 0, "ZERO_SHARES");
        require(asset.transferFrom(msg.sender, address(this), assets), "TRANSFER_IN");
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver) external returns (uint256 assets) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        assets = supply == 0 || managed == 0 ? shares : (shares * managed + supply - 1) / supply;
        require(shares > 0 && asset.transferFrom(msg.sender, address(this), assets), "TRANSFER_IN");
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        shares = supply == 0 || managed == 0 ? assets : (assets * supply + managed - 1) / managed;
        _spendAndBurn(owner, shares);
        require(asset.transfer(receiver, assets), "TRANSFER_OUT");
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        assets = convertToAssets(shares);
        _spendAndBurn(owner, shares);
        require(asset.transfer(receiver, assets), "TRANSFER_OUT");
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function _spendAndBurn(address owner, uint256 shares) internal {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender];
            require(allowed >= shares, "ALLOWANCE");
            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }
        require(balanceOf[owner] >= shares, "SHARES");
        unchecked {
            balanceOf[owner] -= shares;
            totalSupply -= shares;
        }
        emit Transfer(owner, address(0), shares);
    }

    function _mint(address to, uint256 shares) internal {
        totalSupply += shares;
        balanceOf[to] += shares;
        emit Transfer(address(0), to, shares);
    }
}
