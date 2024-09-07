const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { WrapperBuilder } = require("@redstone-finance/evm-connector");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Lock", function () {
  const THRESHOLD = 99_500_000;
  const initialLiquidity = 1000 * 10 ** 18;
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployInsuranceFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();
    const { USDT, USDC } = await getStablecoin();
    const Insurance = await ethers.getContractFactory("Insurance");
    const insurance = await Insurance.deploy(
      owner,
      await USDT.getAddress(),
      await USDC.getAddress(),
      5,
      THRESHOLD,
      8
    );
    console.log(insurance);
    console.log(await insurance.getAddress());

    const wrappedInsurance = WrapperBuilder.wrap(insurance).usingDataService({
      dataFeeds: ["USDT"],
    });

    return { wrappedInsurance, USDT, USDC, owner, otherAccount };
  }

  async function getStablecoin() {
    let USDT, USDC;

    if (network.name === "hardhat" || network.name === "localhost") {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      USDT = await ERC20Mock.deploy("Mock USDT", "USDT", 18);
      USDC = await ERC20Mock.deploy("Mock USDC", "USDC", 18);

      await USDT.waitForDeployment();
      await USDC.waitForDeployment();

      console.log(`Deployed Moch USDT at ${await USDT.getAddress()}`);
      console.log(`Deployed Mock USDC at ${await USDC.getAddress()}`);
    } else {
      const USDT_address = process.env.USDT_ADDRESS;
      const USDC_address = process.env.USDC_ADDRESS;
      if (!USDT_address) throw new Error("USDT_address must be set in .env");
      if (!USDC_address) throw new Error("USDC_address must be set in .env");

      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      USDT = await ERC20Mock.attach(USDT_address);
      USDC = await ERC20Mock.attach(USDC_address);

      console.log(`Attached to USDT at ${USDT.address}`);
      console.log(`Attached to USDC at ${USDC.address}`);
    }

    return { USDT, USDC };
  }

  // const wrappedContract = WrapperBuilder.wrap(contract).usingSimpleNumericMock({
  //   mockSignersCount: 10,
  //   dataPoints: [
  //     { dataFeedId: "AVAX", value: 42 },
  //   ],
  // });

  describe("Deployment", function () {
    it("Should deploy correctly with initial parameters", async function () {
      const { insurance, USDT, USDC, owner } = await loadFixture(
        deployInsuranceFixture
      );

      expect(await insurance.insuredToken()).to.equal(await USDT.getAddress());
      expect(await insurance.treasuryToken()).to.equal(await USDC.getAddress());
      expect(await insurance.policyPriceAPR()).to.equal(5);
      expect(await insurance.owner()).to.equal(owner.address);
    });
  });

  describe("Liquidity Management", function () {
    it("Should add liquidity", async function () {
      const { insurance, USDT, owner } = await loadFixture(
        deployInsuranceFixture
      );

      const addAmount = ethers.utils.parseUnits("1000", 18);
      await USDT.mint(owner.address, addAmount);
      await USDT.approve(insurance.address, addAmount);

      await expect(insurance.addLiquidity(addAmount))
        .to.emit(insurance, "LiquidityAdded")
        .withArgs(addAmount);

      expect(await USDT.balanceOf(insurance.address)).to.equal(addAmount);
    });

    it("Should withdraw liquidity", async function () {
      const { insurance, USDT, owner } = await loadFixture(
        deployInsuranceFixture
      );

      const withdrawAmount = ethers.utils.parseUnits("500", 18);
      await USDT.mint(owner.address, withdrawAmount);
      await USDT.approve(insurance.address, withdrawAmount);
      await insurance.addLiquidity(withdrawAmount);

      await expect(insurance.widthdrawLiquidity(withdrawAmount))
        .to.emit(insurance, "LiquidityWithdrawn")
        .withArgs(withdrawAmount);

      expect(await USDT.balanceOf(owner.address)).to.equal(withdrawAmount);
    });
  });

  describe("Policy Management", function () {
    it("Should create policy", async function () {
      const { wrappedInsurance, USDT, USDC, otherAccount } = await loadFixture(
        deployInsuranceFixture
      );

      const insuredAmount = ethers.utils.parseUnits("100", 18);
      const duration = 60 * 60 * 24 * 30; // 30 days
      const policyPrice = ethers.utils.parseUnits("0.5", 18); // Example premium

      await USDC.mint(otherAccount.address, policyPrice);
      await USDC.connect(otherAccount).approve(
        wrappedInsurance.address,
        policyPrice
      );

      const policyId = await wrappedInsurance.hashPolicy(
        otherAccount.address,
        insuredAmount,
        Math.floor(Date.now() / 1000),
        duration
      );

      await expect(
        wrappedInsurance
          .connect(otherAccount)
          .createPolicy(insuredAmount, duration)
      )
        .to.emit(wrappedInsurance, "PolicyCreated")
        .withArgs(policyId, otherAccount.address, insuredAmount);

      const policy = await wrappedInsurance.policies(policyId);
      expect(policy.policyHolder).to.equal(otherAccount.address);
      expect(policy.insuredAmount).to.equal(insuredAmount);
    });

    it("Should revert ExpiredPolicy", async function () {
      const { wrappedInsurance, USDT, USDC, otherAccount } = await loadFixture(
        deployInsuranceFixture
      );

      const insuredAmount = ethers.utils.parseUnits("100", 18);
      const duration = 60 * 60 * 24 * 30; // 30 days
      const policyPrice = ethers.utils.parseUnits("0.5", 18); // Example premium

      await USDC.mint(otherAccount.address, policyPrice);
      await USDC.connect(otherAccount).approve(
        wrappedInsurance.address,
        policyPrice
      );

      const policyId = await wrappedInsurance.hashPolicy(
        otherAccount.address,
        insuredAmount,
        Math.floor(Date.now() / 1000),
        duration
      );
      await wrappedInsurance
        .connect(otherAccount)
        .createPolicy(insuredAmount, duration);

      // Fast forward beyond the duration
      await time.increase(duration + 1);

      await expect(
        wrappedInsurance.connect(otherAccount).getRepayment(policyId)
      ).to.be.revertedWith("ExpiredPolicy");
    });

    it("Should revert PriceAboveThreshold", async function () {
      const { wrappedInsurance, USDT, USDC, otherAccount } = await loadFixture(
        deployInsuranceFixture
      );

      const insuredAmount = ethers.utils.parseUnits("100", 18);
      const duration = 60 * 60 * 24 * 30; // 30 days
      const policyPrice = ethers.utils.parseUnits("0.5", 18); // Example premium

      await USDC.mint(otherAccount.address, policyPrice);
      await USDC.connect(otherAccount).approve(
        wrappedInsurance.address,
        policyPrice
      );

      const policyId = await wrappedInsurance.hashPolicy(
        otherAccount.address,
        insuredAmount,
        Math.floor(Date.now() / 1000),
        duration
      );
      await wrappedInsurance
        .connect(otherAccount)
        .createPolicy(insuredAmount, duration);

      const mockData = {
        mockSignersCount: 10,
        dataPoints: [{ dataFeedId: "USDT", value: THRESHOLD + 1 }],
      };
      const wrappedContract =
        WrapperBuilder.wrap(wrappedInsurance).usingSimpleNumericMock(mockData);

      await expect(
        wrappedContract.connect(otherAccount).getRepayment(policyId)
      ).to.be.revertedWith("PriceAboveThreshold");
    });

    it("Should repay policy", async function () {
      const { wrappedInsurance, USDT, USDC, otherAccount } = await loadFixture(
        deployInsuranceFixture
      );

      const insuredAmount = ethers.utils.parseUnits("100", 18);
      const duration = 60 * 60 * 24 * 30; // 30 days
      const policyPrice = ethers.utils.parseUnits("0.5", 18); // Example premium

      await USDC.mint(otherAccount.address, policyPrice);
      await USDC.connect(otherAccount).approve(
        wrappedInsurance.address,
        policyPrice
      );

      const policyId = await wrappedInsurance.hashPolicy(
        otherAccount.address,
        insuredAmount,
        Math.floor(Date.now() / 1000),
        duration
      );
      await wrappedInsurance
        .connect(otherAccount)
        .createPolicy(insuredAmount, duration);

      const mockData = {
        mockSignersCount: 10,
        dataPoints: [{ dataFeedId: "USDT", value: THRESHOLD - 10 }],
      };
      const wrappedContract =
        WrapperBuilder.wrap(wrappedInsurance).usingSimpleNumericMock(mockData);

      const repaymentAmount =
        (insuredAmount * (10 ** 8 - (THRESHOLD - 10))) / 10 ** 8;

      await expect(wrappedContract.connect(otherAccount).getRepayment(policyId))
        .to.emit(wrappedContract, "PolicyRepayed")
        .withArgs(policyId, repaymentAmount);
    });
  });

  describe("Fee Collection", function () {
    it("Should collect fee", async function () {
      const { insurance, USDC, owner } = await loadFixture(
        deployInsuranceFixture
      );

      const feeAmount = ethers.utils.parseUnits("100", 18);
      await USDC.mint(insurance.address, feeAmount);

      await expect(insurance.collectFee())
        .to.emit(insurance, "FeeCollected")
        .withArgs(feeAmount);

      expect(await USDC.balanceOf(owner.address)).to.equal(feeAmount);
    });
  });
});
