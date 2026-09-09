// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TestUSDC} from "../src/TestUSDC.sol";
import {FiniteYieldVault} from "../src/FiniteYieldVault.sol";

interface Vm {
    function warp(uint256) external;
}

contract FiniteYieldVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    TestUSDC token;
    FiniteYieldVault vault;

    function setUp() public {
        token = new TestUSDC();
        vault = new FiniteYieldVault(address(token), address(this));
        token.mint(address(this), 200_000e6);
        token.approve(address(vault), type(uint256).max);
    }

    function testFiniteScheduleAndRoundTrip() public {
        uint64 start = uint64(block.timestamp + 100);
        uint64 end = start + 1_000;
        vault.freezeYieldSchedule(start, end, 100e6);
        uint256 shares = vault.deposit(1_000e6, address(this));
        require(shares == 1_000e6, "initial shares");
        require(vault.totalAssets() == 1_000e6, "unvested excluded");
        vm.warp(start + 500);
        require(vault.totalAssets() == 1_050e6, "linear vesting");
        uint256 assets = vault.redeem(shares, address(this), address(this));
        require(assets == 1_050e6, "yield redeemed");
        require(token.balanceOf(address(vault)) == 50e6, "unvested stays funded");
    }

    function testAllCapitalSizesAndRounding() public {
        vault.freezeYieldSchedule(uint64(block.timestamp + 10), uint64(block.timestamp + 20), 3e6);
        uint256[3] memory amounts = [uint256(1_000e6), uint256(10_000e6), uint256(100_000e6)];
        for (uint256 i; i < amounts.length; ++i) {
            uint256 shares = vault.deposit(amounts[i], address(this));
            require(shares > 0, "shares");
            require(vault.maxWithdraw(address(this)) <= vault.totalAssets(), "bounded exit");
        }
        require(vault.previewMint(1) >= vault.convertToAssets(1), "mint rounds up");
        require(vault.previewWithdraw(1) >= vault.convertToShares(1), "withdraw rounds up");
    }

    function testScheduleCannotBeChangedOrUnderfunded() public {
        uint64 start = uint64(block.timestamp + 10);
        vault.freezeYieldSchedule(start, start + 10, 1e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.freezeYieldSchedule, (start + 20, start + 30, 1e6)));
        require(!ok, "schedule changed");
    }
}
