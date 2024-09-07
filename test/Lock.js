const { WrapperBuilder } = require("@redstone-finance/evm-connector");
const { expect } = require("chai");
const { ethers } = require("hardhat");

async function getStablecoin() {
  let USDT, USDC;

  if (network.name === "hardhat" || network.name === "localhost") {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    USDT = await ERC20Mock.deploy("Mock USDT", "USDT", 18);
    USDC = await ERC20Mock.deploy("Mock USDC", "USDC", 18);

    // console.log(`Deployed Moch USDT at ${await USDT.getAddress()}`);
    // console.log(`Deployed Mock USDC at ${await USDC.getAddress()}`);
  } else {
    const USDT_address = process.env.USDT_ADDRESS;
    const USDC_address = process.env.USDC_ADDRESS;
    if (!USDT_address) throw new Error("USDT_address must be set in .env");
    if (!USDC_address) throw new Error("USDC_address must be set in .env");

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    USDT = await ERC20Mock.attach(USDT_address);
    USDC = await ERC20Mock.attach(USDC_address);

    // console.log(`Attached to USDT at ${USDT.address}`);
    // console.log(`Attached to USDC at ${USDC.address}`);
  }

  return { USDT, USDC };
}

describe("MainExample", function () {
  const THRESHOLD = 99_500_000
  let insurance, wrappedContract, owner, otherAccount, USDT, USDC;

  beforeEach(async () => {
    // Deploy contract
    [owner, otherAccount] = await ethers.getSigners();
    ({ USDT, USDC } = await getStablecoin());

    const Insurance = await ethers.getContractFactory("Insurance");
    insurance = await Insurance.deploy(
      owner.address,
      USDT.address,
      USDC.address,
      5,
      THRESHOLD,
      8
    );

    // console.log(insurance.address);
  });

  // // just an example test
  // it("Get STX price securely", async function () {
  //   // Wrapping the contract
  // const wrappedContract = WrapperBuilder.wrap(insurance).usingDataService({
  //   dataPackagesIds: ["USDT"],
  // });

  //   // Interact with the contract (getting oracle value securely)
  //   const stxPrice = await wrappedContract.getLatestStxPrice();
  //   console.log({ stxPrice });
  // });

  it("Should add liquidity", async function () {
    const addAmount = ethers.utils.parseUnits("1000", 18);
    await USDT.mint(owner.address, addAmount);
    await USDT.approve(insurance.address, addAmount);

    await insurance.addLiquidity(addAmount)

    expect(await USDT.balanceOf(insurance.address)).to.equal(addAmount);
  });
  it("Should widthdraw liquidity", async function () { });

  it("Should collect fee", async function () { });

  it("Should create policy when price is above threshold", async function () {
    const insuredAmount = ethers.utils.parseUnits("100", 18);
    const duration = 60 * 60 * 24 * 30; // 30 days
    const insuranceFee = ethers.utils.parseUnits("0.8219178", 18); // Calculated price for 10% APR, 30 days duration

    await USDC.mint(owner.address, insuranceFee);
    // console.log(insurance);
    await USDC.approve(insurance.address, insuranceFee);


    const wrappedContract = WrapperBuilder.wrap(insurance).usingSimpleNumericMock({
      mockSignersCount: 10,
      dataPoints: [
        { dataFeedId: "USDT", value: 1 },
      ],
    });

    const tx = await wrappedContract.createPolicy(insuredAmount, duration);
    const receipt = await tx.wait();
    const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

    // Generate policyId using blockchain timestamp
    const policyId = await wrappedContract.hashPolicy(
      owner.address,
      insuredAmount,
      blockTimestamp,
      duration
    );

    await expect(tx)
      .to.emit(wrappedContract, "PolicyCreated")
      .withArgs(policyId, owner.address, insuredAmount);


    const policy = await wrappedContract.policies(policyId);
    expect(policy.policyHolder).to.equal(owner.address);
    expect(policy.insuredAmount).to.equal(insuredAmount);
  });


  it("Shouldn't create policy when price is under threshold", async function () {

    const insuredAmount = ethers.utils.parseUnits("100", 18);
    const duration = 60 * 60 * 24 * 30; // 30 days
    const insuranceFee = ethers.utils.parseUnits("0.8219178", 18); // Calculated price for 10% APR, 30 days duration

    await USDC.mint(owner.address, insuranceFee);
    // console.log(insurance);
    await USDC.approve(insurance.address, insuranceFee);


    const mockWrappedContract = WrapperBuilder.wrap(insurance).usingSimpleNumericMock({
      mockSignersCount: 10,
      dataPoints: [
        { dataFeedId: "USDT", value: 0.8 },
      ],
    });

    await expect(
      mockWrappedContract.createPolicy(insuredAmount, duration)
    ).to.be.revertedWithCustomError(insurance, "PriceUnderThreshold").withArgs(80_000_000, THRESHOLD);
  });


  it("Should revert getRepayment when PriceAboveThreshold", async function () {
    const insuredAmount = ethers.utils.parseUnits("100", 18);
    const duration = 60 * 60 * 24 * 30; // 30 days
    const insuranceFee = ethers.utils.parseUnits("0.8219178", 18);

    await USDC.mint(owner.address, insuranceFee);
    await USDC.approve(insurance.address, insuranceFee);

    // Wrap the contract with mock data to simulate a price above the threshold
    wrappedContract = WrapperBuilder.wrap(insurance).usingSimpleNumericMock({
      mockSignersCount: 10,
      dataPoints: [{ dataFeedId: "USDT", value: 1 }],
    });

    // Create the policy
    const tx = await wrappedContract.createPolicy(insuredAmount, duration);
    const receipt = await tx.wait();
    const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

    const policyId = await wrappedContract.hashPolicy(
      owner.address,
      insuredAmount,
      blockTimestamp,
      duration
    );

    // Attempt to get repayment when price is above the threshold
    await expect(
      wrappedContract.getRepayment(policyId)
    ).to.be.revertedWithCustomError(insurance, "PriceAboveThreshold");
  });

  it("Should pass getRepayment when price is below threshold", async function () {
    const insuredAmount = ethers.utils.parseUnits("100", 18);
    const duration = 60 * 60 * 24 * 30; // 30 days
    const insuranceFee = ethers.utils.parseUnits("0.8219178", 18);

    await USDC.mint(owner.address, insuranceFee);
    await USDT.mint(insurance.address, ethers.utils.parseUnits("100", 18));
    await USDC.approve(insurance.address, insuranceFee);

    // Wrap the contract with mock data to simulate a price below the threshold
    wrappedContract = WrapperBuilder.wrap(insurance).usingSimpleNumericMock({
      mockSignersCount: 10,
      dataPoints: [{ dataFeedId: "USDT", value: 1 }],
    });

    // Create the policy
    const tx = await wrappedContract.createPolicy(insuredAmount, duration);
    const receipt = await tx.wait();
    const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

    const policyId = await wrappedContract.hashPolicy(
      owner.address,
      insuredAmount,
      blockTimestamp,
      duration
    );

    wrappedContract = WrapperBuilder.wrap(insurance).usingSimpleNumericMock({
      mockSignersCount: 10,
      dataPoints: [{ dataFeedId: "USDT", value: 0.7 }],
    });

    // Ensure repayment works when the price is below the threshold
    await expect(
      wrappedContract.getRepayment(policyId)
    ).to.emit(wrappedContract, "PolicyRepayed");
  });
});
