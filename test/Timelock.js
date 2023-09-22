const { assert } = require("chai");
const { ethers } = require("hardhat");

describe("Timelock", () => {
  let timelock, token, owner, receiver, feeTo;

  const interval = 60;

  before(async () => {
    [owner, receiver, feeTo] = await ethers.getSigners();

    const Timelock = await ethers.getContractFactory("TenggaraTimelock");
    const Token = await ethers.getContractFactory("Token");

    timelock = await Timelock.deploy(feeTo, interval);
    token = await Token.deploy("Test", "TEST", "1000000");
  });

  describe("Check Deployment", () => {
    it(`tracks the feeTo account`, async () => {
      const _feeTo = await timelock.feeTo.call();
      assert.equal(_feeTo, feeTo.address);
    });

    it(`tracks the interval`, async () => {
      const _interval = await timelock.interval.call();
      assert.equal(_interval, interval);
    });

    it(`check the contract owner`, async () => {
      const _owner = await timelock.owner.call();
      assert.equal(_owner, owner.address);
    });
  });

  describe("Create Timelock", async() => {
    
  })
});
