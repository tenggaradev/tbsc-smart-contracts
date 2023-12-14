const hre = require("hardhat");

async function main() {
  const feeTo = "0xBdDDA29c150Df2D57AbE8A19c8664dAc20Ade202";
  const timeLock = await hre.ethers.deployContract("TenggaraTimelock", [feeTo]);

  await timeLock.waitForDeployment();

  console.log(`Timelock contract deployed to ${timeLock.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
