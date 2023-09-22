//SPDX-License-Identifier:MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

library SafeMath {
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    function sub(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }
}

contract TenggaraTimelock is AutomationCompatibleInterface {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    /***********************
    +       Globals        +
    ***********************/
    uint256 public immutable interval;
    uint256 public lastTimeStamp;

    address public owner;
    address public feeTo;

    struct Timelock {
        bool exists;
        uint256 tradeId;
        address tokenContract;
        uint256 amount;
        address sender;
        address receiver;
        uint256 timestamp;
    }

    bytes32[] public listOfTimelockHash;

    mapping(bytes32 => Timelock) timelocks;
    mapping(address => bytes32[]) public addressToTimelockHash;

    /***********************
    +       Events        +
    ***********************/

    event Create(bytes32 tradeHash);
    event Release(bytes32 tradeHash);
    event Cancel(bytes32 tradeHash);

    /***********************
    +     Constructor      +
    ***********************/

    constructor(address _feeTo, uint256 _interval) {
        owner = msg.sender;
        feeTo = _feeTo;
        interval = _interval;
        lastTimeStamp = block.timestamp;
    }

    // modifier onlyOperators() {
    //     require(msg.sender == operators);
    //     _;
    // }

    /***********************
    +    Create Timelock   +
    ***********************/

    function createTimelock(
        uint256 _tradeId,
        address _currency,
        uint256 _amount,
        address _sender,
        address _receiver,
        uint256 _timestamp
    ) external payable {
        require(
            ERC20(_currency).balanceOf(msg.sender) >= _amount,
            "Not enough token"
        );
        bytes32 _tradeHash = keccak256(
            abi.encodePacked(
                _tradeId,
                _currency,
                _amount,
                _sender,
                _receiver,
                _timestamp
            )
        );
        require(!timelocks[_tradeHash].exists, "Timelock already exist");
        timelocks[_tradeHash] = Timelock(
            true,
            _tradeId,
            _currency,
            _amount,
            _sender,
            _receiver,
            _timestamp
        );

        ERC20(_currency).safeTransferFrom(msg.sender, address(this), _amount);
        listOfTimelockHash.push(_tradeHash);
        addressToTimelockHash[msg.sender].push(_tradeHash);
        emit Create(_tradeHash);
    }

    function createTimelockNative(
        uint256 _tradeId,
        address _currency,
        uint256 _amount,
        address _sender,
        address _receiver,
        uint256 _timestamp
    ) external payable {
        // require(
        //     ERC20(_currency).balanceOf(msg.sender) >= _amount,
        //     "Not enough token"
        // );
        require(msg.value >= _amount);
        bytes32 _tradeHash = keccak256(
            abi.encodePacked(
                _tradeId,
                _currency,
                _amount,
                _sender,
                _receiver,
                _timestamp
            )
        );
        require(!timelocks[_tradeHash].exists, "Timelock already exist");
        timelocks[_tradeHash] = Timelock(
            true,
            _tradeId,
            _currency,
            _amount,
            _sender,
            _receiver,
            _timestamp
        );

        // ERC20(_currency).safeTransferFrom(msg.sender, address(this), _amount);
        (bool sent, ) = address(this).call{value: msg.value}("");
        require(sent, "Failed to send Native");

        listOfTimelockHash.push(_tradeHash);
        addressToTimelockHash[msg.sender].push(_tradeHash);
        emit Create(_tradeHash);
    }

    /***********************
    +    Cancel Timelock   +
    ***********************/

    function cancel(bytes32 _tradeHash) external {
        Timelock memory timelock = timelocks[_tradeHash];

        require(msg.sender == timelock.sender, "Not authorized to cancel");
        require(timelock.exists, "Timelock is expired");
        require(
            block.timestamp < timelock.timestamp,
            "Timelock already expired"
        );

        if (
            timelock.tokenContract ==
            address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
        ) {
            (bool sent, ) = timelock.sender.call{value: timelock.amount}("");
            require(sent, "Failed to send");
        } else {
            ERC20(timelock.tokenContract).safeTransfer(
                timelock.sender,
                timelock.amount
            );
        }

        delete timelocks[_tradeHash];
        for (uint256 i = 0; i < addressToTimelockHash[msg.sender].length; i++) {
            if (addressToTimelockHash[msg.sender][i] == _tradeHash) {
                delete addressToTimelockHash[msg.sender][i];
            }
        }
        emit Cancel(_tradeHash);
    }

    /***********************
    +    Release Timelock   +
    ***********************/

    function release(bytes32 _tradeHash) public payable {
        Timelock memory timelock = timelocks[_tradeHash];

        // Need to check this requirements
        require(timelock.exists, "Timelock is expired");
        require(block.timestamp > timelock.timestamp, "Still in timelock");

        uint256 fee = calculateFee(timelock.amount, 100);

        if (
            timelock.tokenContract ==
            address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
        ) {
            (bool sent, ) = timelock.receiver.call{
                value: timelock.amount.sub(fee)
            }("");
            (bool sentFee, ) = feeTo.call{value: fee}("");

            require(sent, "Failed to send");
            require(sentFee, "Failed to send");
        } else {
            ERC20(timelock.tokenContract).safeTransfer(
                timelock.receiver,
                timelock.amount.sub(fee)
            );

            ERC20(timelock.tokenContract).safeTransfer(feeTo, fee);
        }

        delete timelocks[_tradeHash];

        // Update addressToTimelockHash
        address _sender = timelock.sender;

        for (uint256 i = 0; i < addressToTimelockHash[_sender].length; i++) {
            if (addressToTimelockHash[_sender][i] == _tradeHash) {
                delete addressToTimelockHash[_sender][i];
            }
        }

        emit Release(_tradeHash);
    }

    // Getter, should be public?
    function getTimelock(
        bytes32 _tradeHash
    ) public view returns (Timelock memory) {
        return timelocks[_tradeHash];
    }

    /***************************
    +    Chainlink Automation  +
    ****************************/

    function checkTimestamp()
        public
        view
        returns (bool isEmpty, uint256 relesaseTimelock)
    {
        uint256 length = 0;

        for (uint256 i = 0; i < listOfTimelockHash.length; i++) {
            Timelock memory timelock = timelocks[listOfTimelockHash[i]];
            if (timelock.exists) {
                if (timelock.timestamp <= block.timestamp) {
                    length++;
                }
            }
        }

        if (length > 0) {
            return (true, length);
        }
    }

    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        (bool isEmpty, uint256 length) = checkTimestamp();
        bytes32[] memory _timelockRelease = new bytes32[](length);
        uint256 order = 0;

        if (isEmpty) {
            for (uint256 i = 0; i < listOfTimelockHash.length; i++) {
                Timelock memory timelock = timelocks[listOfTimelockHash[i]];
                if (timelock.exists && timelock.timestamp <= block.timestamp) {
                    _timelockRelease[order] = listOfTimelockHash[i];
                    order = order + 1;
                }
            }

            return (isEmpty, abi.encode(_timelockRelease));
        }

        return (isEmpty, abi.encode(_timelockRelease));
    }

    function performUpkeep(bytes calldata performData) external override {
        bytes32[] memory tradeHash = abi.decode(performData, (bytes32[]));

        for (uint256 i = 0; i < tradeHash.length; i++) {
            Timelock memory timelock = timelocks[tradeHash[i]];

            // Verify if the timelock timestamp is exists and outdated
            if (timelock.exists && timelock.timestamp <= block.timestamp) {
                release(tradeHash[i]);
            }
        }
    }

    function calculateFee(
        uint256 _amount,
        uint256 _bps
    ) private pure returns (uint256) {
        // require((_amount * _bps) >= 10_000);
        return (_amount * _bps) / 10_000;
    }

    receive() external payable {}
}
