import inquirer from "inquirer";

import Program from "./command.js";
import {
  amountOptionCreate,
  chainWithL1Option,
  l1RpcUrlOption,
  l2RpcUrlOption,
  privateKeyOption,
  recipientOptionCreate,
  zeekOption,
} from "../../common/options.js";
import { l2Chains } from "../../data/chains.js";
import { ETH_TOKEN } from "../../utils/constants.js";
import { bigNumberToDecimal, decimalToBigNumber } from "../../utils/formatters.js";
import {
  getAddressFromPrivateKey,
  getL1Provider,
  getL2Provider,
  getL2Wallet,
  optionNameToParam,
} from "../../utils/helpers.js";
import Logger from "../../utils/logger.js";
import { isDecimalAmount, isAddress, isPrivateKey } from "../../utils/validators.js";
import zeek from "../../utils/zeek.js";

import type { DefaultTransferOptions } from "../../common/options.js";

const amountOption = amountOptionCreate("deposit");
const recipientOption = recipientOptionCreate("L2");

type DepositOptions = DefaultTransferOptions;

export const handler = async (options: DepositOptions) => {
  try {
    Logger.debug(
      `Initial deposit options: ${JSON.stringify(
        { ...options, ...(options.privateKey ? { privateKey: "<hidden>" } : {}) },
        null,
        2
      )}`
    );

    const answers: DepositOptions = await inquirer.prompt(
      [
        {
          message: chainWithL1Option.description,
          name: optionNameToParam(chainWithL1Option.long!),
          type: "list",
          choices: l2Chains.filter((e) => e.l1Chain).map((e) => ({ name: e.name, value: e.network })),
          required: true,
          when(answers: DepositOptions) {
            if (answers.l1Rpc && answers.rpc) {
              return false;
            }
            return true;
          },
        },
        {
          message: amountOption.description,
          name: optionNameToParam(amountOption.long!),
          type: "input",
          required: true,
          validate: (input: string) => isDecimalAmount(input),
        },
        {
          message: privateKeyOption.description,
          name: optionNameToParam(privateKeyOption.long!),
          type: "password",
          required: true,
          validate: (input: string) => isPrivateKey(input),
        },
        {
          message: recipientOption.description,
          name: optionNameToParam(recipientOption.long!),
          type: "input",
          default: (answers: DepositOptions) => {
            return getAddressFromPrivateKey(answers.privateKey);
          },
          required: true,
          validate: (input: string) => isAddress(input),
        },
      ],
      options
    );

    options = {
      ...options,
      ...answers,
    };

    Logger.debug(`Final deposit options: ${JSON.stringify({ ...options, privateKey: "<hidden>" }, null, 2)}`);

    const fromChain = l2Chains.find((e) => e.network === options.chain)?.l1Chain;
    const fromChainLabel = fromChain && !options.l1Rpc ? fromChain.name : options.l1Rpc ?? "Unknown chain";
    const toChain = l2Chains.find((e) => e.network === options.chain);
    const toChainLabel = toChain && !options.rpc ? toChain.name : options.rpc ?? "Unknown chain";

    Logger.info("\nDeposit:");
    Logger.info(` From: ${getAddressFromPrivateKey(answers.privateKey)} (${fromChainLabel})`);
    Logger.info(` To: ${options.recipient} (${toChainLabel})`);
    Logger.info(` Amount: ${bigNumberToDecimal(decimalToBigNumber(options.amount))} ETH`);

    Logger.info("\nSending deposit transaction...");

    const l1Provider = getL1Provider(options.l1Rpc ?? fromChain!.rpcUrl);
    const l2Provider = getL2Provider(options.rpc ?? toChain!.rpcUrl);
    const senderWallet = getL2Wallet(options.privateKey, l2Provider, l1Provider);

    const depositHandle = await senderWallet.deposit({
      to: options.recipient,
      token: ETH_TOKEN.l1Address,
      amount: decimalToBigNumber(options.amount),
    });
    Logger.info("\nDeposit sent:");
    Logger.info(` Transaction hash: ${depositHandle.hash}`);
    if (fromChain?.explorerUrl) {
      Logger.info(` Transaction link: ${fromChain.explorerUrl}/tx/${depositHandle.hash}`);
    }

    const senderBalance = await l1Provider.getBalance(senderWallet.address);
    Logger.info(`\nSender L1 balance after transaction: ${bigNumberToDecimal(senderBalance)} ETH`);

    if (options.zeek) {
      zeek();
    }
  } catch (error) {
    Logger.error("There was an error while depositing funds:");
    Logger.error(error);
  }
};

Program.command("deposit")
  .description("Transfer ETH from L1 to L2")
  .addOption(amountOption)
  .addOption(chainWithL1Option)
  .addOption(recipientOption)
  .addOption(l1RpcUrlOption)
  .addOption(l2RpcUrlOption)
  .addOption(privateKeyOption)
  .addOption(zeekOption)
  .action(handler);
