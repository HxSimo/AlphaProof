// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ProofOfAlphaRegistry} from "../src/ProofOfAlphaRegistry.sol";

contract UnauthorizedPublisher {
    function publish(ProofOfAlphaRegistry registry, bytes32 experimentId, bytes32 root, bytes32 leaves) external {
        registry.publishBatch(experimentId, 1, 1, root, bytes32(0), leaves, bytes32(uint256(1)));
    }
}

contract ProofOfAlphaRegistryTest {
    ProofOfAlphaRegistry registry;
    bytes32 constant EXPERIMENT = keccak256("experiment-registry");
    bytes32 constant ROOT_ONE = keccak256("root-one");
    bytes32 constant ROOT_TWO = keccak256("root-two");
    bytes32 constant LEAVES_ONE = keccak256("leaves-one");
    bytes32 constant LEAVES_TWO = keccak256("leaves-two");

    function setUp() public {
        registry = new ProofOfAlphaRegistry(address(this));
    }

    function publish(uint64 first, uint64 last, bytes32 root, bytes32 previous, bytes32 leaves) private returns (bytes32 hash) {
        hash = registry.computeBatchHash(EXPERIMENT, first, last, root, previous, leaves);
        registry.publishBatch(EXPERIMENT, first, last, root, previous, leaves, hash);
    }

    function testAppendOnlyContinuityAndRetrieval() public {
        bytes32 first = publish(1, 3, ROOT_ONE, bytes32(0), LEAVES_ONE);
        bytes32 second = publish(4, 5, ROOT_TWO, first, LEAVES_TWO);
        (uint64 lastSequence, uint64 count, bytes32 head) = registry.heads(EXPERIMENT);
        require(lastSequence == 5 && count == 2 && head == second, "head");
        ProofOfAlphaRegistry.Batch memory retained = registry.getBatch(EXPERIMENT, 0);
        require(retained.batchHash == first && retained.root == ROOT_ONE, "old batch retained");
    }

    function testRejectsDuplicateGapOverlapAndWrongPredecessor() public {
        bytes32 first = publish(1, 3, ROOT_ONE, bytes32(0), LEAVES_ONE);
        (bool duplicate,) = address(registry).call(
            abi.encodeCall(registry.publishBatch, (EXPERIMENT, 1, 3, ROOT_ONE, bytes32(0), LEAVES_ONE, first))
        );
        require(!duplicate, "duplicate accepted");
        bytes32 gapHash = registry.computeBatchHash(EXPERIMENT, 5, 5, ROOT_TWO, first, LEAVES_TWO);
        (bool gap,) = address(registry).call(
            abi.encodeCall(registry.publishBatch, (EXPERIMENT, 5, 5, ROOT_TWO, first, LEAVES_TWO, gapHash))
        );
        require(!gap, "gap accepted");
        bytes32 overlapHash = registry.computeBatchHash(EXPERIMENT, 3, 4, ROOT_TWO, first, LEAVES_TWO);
        (bool overlap,) = address(registry).call(
            abi.encodeCall(registry.publishBatch, (EXPERIMENT, 3, 4, ROOT_TWO, first, LEAVES_TWO, overlapHash))
        );
        require(!overlap, "overlap accepted");
        bytes32 wrong = keccak256("wrong");
        bytes32 wrongHash = registry.computeBatchHash(EXPERIMENT, 4, 4, ROOT_TWO, wrong, LEAVES_TWO);
        (bool predecessor,) = address(registry).call(
            abi.encodeCall(registry.publishBatch, (EXPERIMENT, 4, 4, ROOT_TWO, wrong, LEAVES_TWO, wrongHash))
        );
        require(!predecessor, "wrong predecessor accepted");
    }

    function testPublisherRoleIsSeparateAndRevocable() public {
        UnauthorizedPublisher attacker = new UnauthorizedPublisher();
        (bool unauthorized,) = address(attacker).call(
            abi.encodeCall(attacker.publish, (registry, EXPERIMENT, ROOT_ONE, LEAVES_ONE))
        );
        require(!unauthorized, "unauthorized publisher");
        registry.setPublisher(address(this), false);
        bytes32 hash = registry.computeBatchHash(EXPERIMENT, 1, 1, ROOT_ONE, bytes32(0), LEAVES_ONE);
        (bool revoked,) = address(registry).call(
            abi.encodeCall(registry.publishBatch, (EXPERIMENT, 1, 1, ROOT_ONE, bytes32(0), LEAVES_ONE, hash))
        );
        require(!revoked, "revoked publisher");
    }
}
