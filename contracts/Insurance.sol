// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@redstone-finance/evm-connector/contracts/data-services/MainDemoConsumerBase.sol";
import "@redstone-finance/evm-connector/contracts/mocks/RedstoneConsumerNumericMock.sol";
import {IInsurance} from "./IInsurance.sol";

contract Insurance is IInsurance, Ownable, RedstoneConsumerNumericMock {
    uint256 public constant YEAR_DURATION = 31_536_000; // 24 * 60 * 60 * 365

    IERC20Metadata public insuredToken;
    IERC20Metadata public treasuryToken;
    uint256 public policyPriceAPR;

    uint256 public threshold;
    bytes32 public symbol;
    uint256 public oracleDecimals;

    mapping(uint256 policyId => Policy) public policies;

    constructor(
        address _initialOwner,
        IERC20Metadata _insuredToken,
        IERC20Metadata _treasuryToken,
        uint256 _policyPriceAPR,
        uint256 _threshold,
        uint256 _oracleDecimals // 8 is a default for RedStone
    ) {
        transferOwnership(_initialOwner);
        insuredToken = _insuredToken;
        treasuryToken = _treasuryToken;
        policyPriceAPR = _policyPriceAPR;
        threshold = _threshold;
        symbol = "USDT";
        // symbol = bytes32(bytes(insuredToken.symbol()));
        oracleDecimals = _oracleDecimals;
    }

    // function getLatestStxPrice() public view returns (uint256) {
    //     bytes32 dataFeedId = bytes32("USDT");
    //     return getOracleNumericValueFromTxMsg(dataFeedId);
    // }

    // function validateTimestamp(uint256 receivedTimestampMilliseconds)
    //     public
    //     view
    //     override(RedstoneConsumerNumericMock, MainDemoConsumerBase)
    // {}

    function createPolicy(uint256 insuredAmount, uint256 duration) public returns (uint256 policyId) {
        uint256 insuranceFee = (insuredAmount * policyPriceAPR * duration) / (YEAR_DURATION * 100);

        // add depeg check
        uint256 priceCurrent = getOracleNumericValueFromTxMsg(bytes32(symbol));
        if (priceCurrent < threshold) {
            revert PriceUnderThreshold(priceCurrent, threshold);
        }

        policyId = hashPolicy(msg.sender, insuredAmount, block.timestamp, duration);
        if (policies[policyId].policyHolder != address(0)) {
            revert PolicyAlreadyExists();
        }
        policies[policyId] = Policy(msg.sender, insuredAmount, block.timestamp, block.timestamp + duration);

        treasuryToken.transferFrom(msg.sender, address(this), insuranceFee);
        emit PolicyCreated(policyId, msg.sender, insuredAmount);
    }

    function getRepayment(uint256 policyId) public returns (uint256 repaymentAmount) {
        //checks
        Policy storage policy = policies[policyId];
        if (policy.policyHolder == address(0)) {
            revert UnexistantPolicy();
        }
        if (policy.policyHolder != msg.sender) {
            revert UnauthorizatedHolder();
        }
        if (policy.endTimestamp < block.timestamp) {
            // uint256 timestamp = policy.endTimestamp;
            // delete policies[policyId];
            revert ExpiredPolicy();
        }

        // price request
        uint256 price = getOracleNumericValueFromTxMsg(symbol);

        if (price > threshold) {
            revert PriceAboveThreshold(price, threshold);
        }

        repaymentAmount = (policy.insuredAmount * (10 ** oracleDecimals - price)) / 10 ** oracleDecimals;
        insuredToken.transfer(msg.sender, repaymentAmount);

        emit PolicyRepayed(policyId, repaymentAmount);

        delete policies[policyId];
    }

    function addLiquidity(uint256 amount) public onlyOwner {
        insuredToken.transferFrom(msg.sender, address(this), amount);
    }

    function widthdrawLiquidity(uint256 amount) public onlyOwner {
        insuredToken.transfer(msg.sender, amount);
    }

    function collectFee() public onlyOwner {
        treasuryToken.transfer(msg.sender, treasuryToken.balanceOf(address(this)));
    }

    function hashPolicy(address policyHolder, uint256 insuredAmount, uint256 startTimestamp, uint256 duration)
        public
        pure
        virtual
        returns (uint256 policyId)
    {
        return uint256(keccak256(abi.encodePacked(policyHolder, insuredAmount, startTimestamp, duration)));
    }
}
