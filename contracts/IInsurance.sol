// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IInsurance {
    struct Policy {
        address policyHolder;
        uint256 insuredAmount;
        uint256 startTimestamp;
        uint256 endTimestamp;
        bool finished;
    }

    event PolicyCreated(uint256 indexed policyId, address indexed holder, uint256 indexed insuredAmount);

    event PolicyRepayed(uint256 indexed policyId, uint256 indexed repaymentAmount);

    error NonexistantPolicy();
    error UnauthorizatedHolder();
    error ExpiredPolicy();
    error FinishedPolicy();
    error PolicyAlreadyExists();
    error PriceAboveThreshold(uint256 currentPrice, uint256 threshold);
    error PriceUnderThreshold(uint256 currentPrice, uint256 threshold);
}
