const hre = require("hardhat");

async function main() {
  const feeTo = "0x50848994d77080b5f8dcaa03d8af2ade726b3092";
  const interval = 60;
  const timeLock = await hre.ethers.deployContract("TimeLock", [feeTo, interval]);

  await timeLock.waitForDeployment();

  console.log(`Timelock contract deployed to ${timeLock.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
