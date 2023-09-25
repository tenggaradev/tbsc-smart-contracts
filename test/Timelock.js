const { assert, expect } = require("chai");
const { ethers } = require("hardhat");

const toEther = (num) => {
  return ethers.parseUnits(num.toString(), "ether");
};

const formatEther = (num) => {
  return ethers.formatEther(num);
};

describe("Timelock", () => {
  let timelock, token, owner, sender, receiver, feeTo;

  const interval = 60;

  before(async () => {
    [owner, sender, receiver, feeTo] = await ethers.getSigners();
    const Timelock = await ethers.getContractFactory("TenggaraTimelock");
    timelock = await Timelock.deploy(feeTo, interval);
    await timelock.waitForDeployment();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Test", "TEST", "1000000");
    await token.waitForDeployment();
  });

  describe("Deployment", () => {
    it(`Should set the right feeTo account`, async () => {
      const _feeTo = await timelock.feeTo.call();
      assert.equal(_feeTo, feeTo.address);
    });

    it(`Should set the right interval`, async () => {
      const _interval = await timelock.interval.call();
      assert.equal(_interval, interval);
    });

    it(`Should set the right contract owner`, async () => {
      const _owner = await timelock.owner.call();
      assert.equal(_owner, owner.address);
    });
  });

  describe("Create Timelock", () => {
    let transaction,
      currency,
      balanceSender,
      balanceOwner,
      amount,
      timelockHash;

    const id = Date.now() + Math.floor(Math.random() * 1000000);
    const elapsedTime = 7000;
    const timestamp = Math.floor((Date.now() + elapsedTime) / 1000);

    before(async () => {
      amount = toEther(1000);

      // Transfer Token from Owner To Sender
      await token.connect(owner).transfer(sender.address, amount);

      // Approve Token for Timelock
      await token.connect(sender).approve(await timelock.getAddress(), amount);

      balanceSender = await token.connect(sender).balanceOf(sender.address);
      balanceOwner = await token.connect(owner).balanceOf(owner.address);
      currency = await token.getAddress();

      // Create timelock
      transaction = await timelock
        .connect(sender)
        .createTimelock(
          id,
          currency,
          amount,
          sender.address,
          receiver.address,
          timestamp
        );

      await transaction.wait();

      // Timelock hash
      timelockHash = await timelock.listOfTimelockHash(0);
    });

    it(`list of timelock hash should not be empty`, async () => {
      assert(timelockHash);
    });

    it(`timelock should contains the correct inputs`, async () => {
      const inputs = await timelock.getTimelock(timelockHash);

      assert.exists(inputs[0], `timelock didn't exist`);
      assert.equal(inputs[1], id, `timelock id didn't match`);
      assert.equal(
        inputs[2],
        currency,
        `timelock address contract didn't match`
      );
      assert.equal(inputs[3], amount, `amount didn't match`);
      assert.equal(
        inputs[4],
        sender.address,
        `timelock sender address didn't match`
      );
      assert.equal(
        inputs[5],
        receiver.address,
        `timelock receiver address didn't match`
      );
      assert.equal(inputs[6], timestamp, `timelock timestamp didn't match`);
    });

    describe("Cancel Timelock", () => {
      const testAfterExpired = async () => {
        return new Promise((resolve) =>
          setTimeout(resolve, elapsedTime + 5000)
        );
      };

      it(`console`, async () => {});

      describe("Success Cancel", () => {
        it(`should be able to cancel`, async () => {
          await expect(timelock.connect(sender).cancel(timelockHash)).to.be
            .fulfilled;
        });
      });

      describe("Cancel Revert", () => {
        it(`should revert if not the authorized sender call the contract`, async () => {
          await expect(timelock.connect(receiver).cancel(timelockHash)).to.be
            .reverted;
        });

        it(`should revert the transaction if called after expired`, async () => {
          await testAfterExpired();
          await expect(timelock.connect(sender).cancel(timelockHash)).to.be
            .reverted;
        });
      });
    });
  });
});
