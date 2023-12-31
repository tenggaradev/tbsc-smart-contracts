const { assert, expect } = require("chai");
const { Contract } = require("ethers");
const { ethers } = require("hardhat");

const toEther = (num) => {
  return ethers.parseUnits(num.toString(), "ether");
};

const formatEther = (num) => {
  return ethers.formatEther(num);
};

describe("Timelock", () => {
  let timelock, token, owner, sender, receiver, feeTo;
  let topic, interface;

  const fee = 1 / 100;

  before(async () => {
    [owner, sender, receiver, feeTo] = await ethers.getSigners();
    const Timelock = await ethers.getContractFactory("TenggaraTimelock");
    timelock = await Timelock.deploy(feeTo);
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

    it(`Should set the right contract owner`, async () => {
      const _owner = await timelock.owner.call();
      assert.equal(_owner, owner.address);
    });
  });

  describe("Create Timelock", () => {
    let transaction, receit, currency, timelockHash;
    let timelockAddress;
    let balanceSender,
      balanceContract,
      balanceSenderBefore,
      balanceContractBefore,
      balanceFeeTo;

    const id = Date.now() + Math.floor(Math.random() * 1000000);
    const elapsedTime = 11000;
    const timestamp = Math.floor((Date.now() + elapsedTime) / 1000);
    const amount = toEther(1000);

    before(async () => {
      timelockAddress = await timelock.getAddress();
      currency = await token.getAddress();

      // Transfer Token from Owner To Sender
      await token.connect(owner).transfer(sender.address, amount);

      // Approve Token for Timelock
      await token.connect(sender).approve(await timelock.getAddress(), amount);

      // Balance Before Timelock Creation:
      balanceSenderBefore = await token.balanceOf(sender.address);
      balanceContractBefore = await token.balanceOf(timelockAddress);

      // Create Timelock
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

      receit = await transaction.wait();

      // Timelock hash
      timelockHash = await timelock.listOfTimelockHash(0);

      // Balance After Timelock Creation
      balanceSender = await token.balanceOf(sender.address);
      balanceContract = await token.balanceOf(timelockAddress);
    });

    describe("Success", () => {
      let eventCreate;

      before(async () => {
        const eventFragment = timelock.interface.getEvent("Create");
        const eventTopic = eventFragment.topicHash;
        const log = receit.logs.find((x) => x.topics.indexOf(eventTopic) >= 0);
        eventCreate = timelock.interface.parseLog(log);
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

      it("should increase the timelock contract balance", async () => {
        assert.equal(formatEther(balanceContract), formatEther(amount));
      });

      it("should decrease the sender balance", async () => {
        assert.equal(formatEther(balanceSender), 0);
      });

      it("should emit Create event", async () => {
        assert(eventCreate, "Expected create event to be emitted");
        assert.equal(eventCreate.args.length, 1);
        assert.equal(eventCreate.args[0], timelockHash);
      });
    });

    describe("Failure", () => {
      it(`should revert when sender doesn't have the token`, async () => {
        // Create timelock
        await expect(
          timelock
            .connect(sender)
            .createTimelock(
              id,
              currency,
              amount,
              sender.address,
              receiver.address,
              timestamp
            )
        ).to.be.reverted;
      });

      it(`should revert when timestamp already exists`, async () => {
        // Transfer Token from Owner To Sender
        await token.connect(owner).transfer(sender.address, amount);

        // Create timelock
        await expect(
          timelock
            .connect(sender)
            .createTimelock(
              id,
              currency,
              amount,
              sender.address,
              receiver.address,
              timestamp
            )
        ).to.be.reverted;
      });

      it(`should revert when no tokens are approved`, async () => {
        let newTimestamp = Math.floor((Date.now() + elapsedTime) / 1000);

        // Create timelock
        await expect(
          timelock
            .connect(sender)
            .createTimelock(
              id,
              currency,
              amount,
              sender.address,
              receiver.address,
              newTimestamp
            )
        ).to.be.reverted;
      });
    });

    describe("Cancel Timelock", () => {
      let cancelTransaction,
        cancelReceit,
        balanceSenderBeforeCancel,
        balanceSenderAfter,
        balanceContractAfter;

      const testAfterExpired = async () => {
        return new Promise((resolve) =>
          setTimeout(resolve, elapsedTime + 5000)
        );
      };

      before(async () => {
        // Balance before cancel
        balanceSenderBeforeCancel = await token.balanceOf(sender.address);

        cancelTransaction = await timelock.connect(sender).cancel(timelockHash);
        cancelReceit = await cancelTransaction.wait();

        // Balance after cancel
        balanceSenderAfter = await token.balanceOf(sender.address);
        balanceContractAfter = await token.balanceOf(timelockAddress);
      });

      describe("Success", () => {
        let cancelEvent;

        before(async () => {
          const eventFragment = timelock.interface.getEvent("Cancel");
          const eventTopic = eventFragment.topicHash;
          const log = cancelReceit.logs.find(
            (x) => x.topics.indexOf(eventTopic) >= 0
          );
          cancelEvent = timelock.interface.parseLog(log);
        });

        it(`should be able to cancel`, async () => {
          assert(cancelReceit, "Expected to fullfiled the cancel transaction");
        });

        it(`should decrease the contract balance`, async () => {
          assert.equal(
            formatEther(balanceContractAfter),
            formatEther(balanceContractBefore)
          );
        });

        it(`should increase the sender balance`, async () => {
          const _balanceSender = formatEther(balanceSenderBefore + amount);
          assert.equal(formatEther(balanceSenderAfter), _balanceSender);
        });

        it(`should emit Cancel event`, async () => {
          assert(cancelEvent, "Expected to emit Cancel event");
          assert.equal(cancelEvent.args.length, 1, "Expected 1 input param");
          assert.equal(
            cancelEvent.args[0],
            timelockHash,
            `Expected input to equal ${timelockHash}`
          );
        });
      });

      describe("Failure", () => {
        before(async () => {
          // Transfer Token from Owner To Sender
          await token.connect(owner).transfer(sender.address, amount);

          // Approve Token for Timelock
          await token
            .connect(sender)
            .approve(await timelock.getAddress(), amount);

          // Create a new timelock
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

        it(`should revert if call by unauthorized sender`, async () => {
          await expect(timelock.connect(receiver).cancel(timelockHash)).to.be
            .reverted;
          await expect(timelock.connect(owner).cancel(timelockHash)).to.be
            .reverted;
        });

        it(`should revert the transaction if called after expired`, async () => {
          await testAfterExpired();
          await expect(timelock.connect(sender).cancel(timelockHash)).to.be
            .reverted;
        });
      });
    });

    describe("Release Timelock", () => {
      // Should create a new timelock
      before(async () => {
        const newElapsedTime = 30000;
        const newTimestamp = Math.floor((Date.now() + newElapsedTime) / 1000);

        // Transfer Token from Owner To Sender
        await token.connect(owner).transfer(sender.address, amount);

        // Approve Token for Timelock
        await token
          .connect(sender)
          .approve(await timelock.getAddress(), amount);

        // Create Timelock
        transaction = await timelock
          .connect(sender)
          .createTimelock(
            id,
            currency,
            amount,
            sender.address,
            receiver.address,
            newTimestamp
          );

        await transaction.wait();
      });

      // Then try to release before it's expired
      describe("Failure", () => {
        let newTimelockHash;

        before(async () => {
          newTimelockHash = await timelock.listOfTimelockHash(2);
        });

        it(`should not be able to release before the timestamp expired`, async () => {
          // Check block.timestamp
          // const blockNumBefore = await ethers.provider.getBlockNumber();
          // const blockBefore = await ethers.provider.getBlock(blockNumBefore);
          // const timestampBefore = blockBefore.timestamp;

          // Check timelock.timestamp
          // const inputs = await timelock.getTimelock(newTimelockHash);
          // console.log("timestamp timelock", inputs[6]);

          await expect(timelock.connect(owner).release(newTimelockHash)).to.be
            .reverted;
        });
      });

      describe("Success", () => {
        let newTimelockHash,
          balanceReceiverBefore,
          balanceReceiver,
          balanceFeeToBefore,
          balanceFeeTo;

        before(async () => {
          balanceReceiverBefore = await token.balanceOf(receiver.address);
          balanceFeeToBefore = await token.balanceOf(feeTo.address);
          newTimelockHash = await timelock.listOfTimelockHash(1);
        });

        it(`should be able to release the timelock`, async () => {
          await expect(timelock.connect(owner).release(newTimelockHash)).to.be
            .fulfilled;
        });

        it(`should transfer the funds to receiver`, async () => {
          balanceReceiver = await token.balanceOf(receiver.address);

          const amountMinusFee =
            formatEther(amount) - formatEther(amount) * fee;
          assert.equal(
            formatEther(balanceReceiver),
            amountMinusFee,
            `receiver balance should equal ${amountMinusFee}`
          );
        });

        it(`should transfer the funds to feeTo`, async () => {
          const amountFee = formatEther(amount) * fee;
          balanceFeeTo = await token.balanceOf(feeTo.address);
          assert.equal(
            formatEther(balanceFeeTo),
            amountFee,
            `feeTo balance should equal ${amountFee}`
          );
        });
      });
    });
  });
});
