const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const mockUSDC = await deploy('ERC20Mock', {
    from: deployer,
    args: ["Mock USDC", "USDC", 18],
    log: true,
  });

  const mockUSDT = await deploy('ERC20Mock', {
    from: deployer,
    args: ["Mock USDT", "USDT", 18],
    log: true,
  });

  const deployerSigner = await ethers.getSigner(deployer);
  const mockUSDCContract = await ethers.getContractAt('ERC20Mock', mockUSDC.address, deployerSigner)
  const mockUSDTContract = await ethers.getContractAt('ERC20Mock', mockUSDT.address, deployerSigner)

  await mockUSDCContract.mint(deployer, ethers.utils.parseUnits("1000", 18))
  await mockUSDTContract.mint(deployer, ethers.utils.parseUnits("1000", 18))

  await deploy('Insurance', {
    from: deployer,
    args: [deployer, mockUSDT.address, mockUSDC.address, 5, 99_500_000, 8],
    log: true,
  });
};
module.exports.tags = ['Insurance'];