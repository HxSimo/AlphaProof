// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Append-only Proof of Alpha commitment heads. Publications happen
/// after application receipt and therefore prove integrity from this anchor,
/// not that the server received an intent before execution.
contract ProofOfAlphaRegistry {
    bytes32 public constant BATCH_DOMAIN = keccak256("PROOF_OF_ALPHA_COMMITMENT_BATCH_V1");

    struct Head {
        uint64 lastSequence;
        uint64 batchCount;
        bytes32 batchHash;
    }

    struct Batch {
        uint64 firstSequence;
        uint64 lastSequence;
        bytes32 root;
        bytes32 previousBatchHash;
        bytes32 leavesObjectHash;
        bytes32 batchHash;
        uint64 publishedAtBlock;
        address publisher;
    }

    address public owner;
    mapping(address => bool) public isPublisher;
    mapping(bytes32 => Head) public heads;
    mapping(bytes32 => mapping(uint64 => Batch)) private batches;

    event PublisherSet(address indexed publisher, bool allowed);
    event BatchPublished(
        bytes32 indexed experimentIdHash,
        uint64 indexed batchIndex,
        uint64 firstSequence,
        uint64 lastSequence,
        bytes32 root,
        bytes32 previousBatchHash,
        bytes32 leavesObjectHash,
        bytes32 batchHash,
        address publisher
    );

    error Unauthorized();
    error InvalidBatch();
    error SequenceDiscontinuity();
    error WrongPredecessor();

    constructor(address initialPublisher) {
        if (initialPublisher == address(0)) revert InvalidBatch();
        owner = msg.sender;
        isPublisher[initialPublisher] = true;
        emit PublisherSet(initialPublisher, true);
    }

    function setPublisher(address publisher, bool allowed) external {
        if (msg.sender != owner) revert Unauthorized();
        if (publisher == address(0)) revert InvalidBatch();
        isPublisher[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    function transferOwnership(address nextOwner) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextOwner == address(0)) revert InvalidBatch();
        owner = nextOwner;
    }

    function computeBatchHash(
        bytes32 experimentIdHash,
        uint64 firstSequence,
        uint64 lastSequence,
        bytes32 root,
        bytes32 previousBatchHash,
        bytes32 leavesObjectHash
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BATCH_DOMAIN,
                experimentIdHash,
                firstSequence,
                lastSequence,
                root,
                previousBatchHash,
                leavesObjectHash
            )
        );
    }

    function publishBatch(
        bytes32 experimentIdHash,
        uint64 firstSequence,
        uint64 lastSequence,
        bytes32 root,
        bytes32 previousBatchHash,
        bytes32 leavesObjectHash,
        bytes32 claimedBatchHash
    ) external {
        if (!isPublisher[msg.sender]) revert Unauthorized();
        if (
            experimentIdHash == bytes32(0) || root == bytes32(0) ||
            leavesObjectHash == bytes32(0) || firstSequence == 0 ||
            firstSequence > lastSequence
        ) revert InvalidBatch();
        Head storage head = heads[experimentIdHash];
        if (firstSequence != head.lastSequence + 1) revert SequenceDiscontinuity();
        if (previousBatchHash != head.batchHash) revert WrongPredecessor();
        bytes32 actual = computeBatchHash(
            experimentIdHash,
            firstSequence,
            lastSequence,
            root,
            previousBatchHash,
            leavesObjectHash
        );
        if (claimedBatchHash != actual) revert InvalidBatch();
        uint64 index = head.batchCount;
        batches[experimentIdHash][index] = Batch({
            firstSequence: firstSequence,
            lastSequence: lastSequence,
            root: root,
            previousBatchHash: previousBatchHash,
            leavesObjectHash: leavesObjectHash,
            batchHash: actual,
            publishedAtBlock: uint64(block.number),
            publisher: msg.sender
        });
        head.lastSequence = lastSequence;
        head.batchCount = index + 1;
        head.batchHash = actual;
        emit BatchPublished(
            experimentIdHash,
            index,
            firstSequence,
            lastSequence,
            root,
            previousBatchHash,
            leavesObjectHash,
            actual,
            msg.sender
        );
    }

    function getBatch(bytes32 experimentIdHash, uint64 index) external view returns (Batch memory) {
        return batches[experimentIdHash][index];
    }
}
