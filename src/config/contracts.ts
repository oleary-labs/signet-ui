import { type Address } from "viem";
import { env } from "./env";
import SignetFactoryABI from "@/lib/abi/SignetFactory.abi.json";
import SignetGroupABI from "@/lib/abi/SignetGroup.abi.json";
import SignetAccountABI from "@/lib/abi/SignetAccount.abi.json";
import SignetAccountFactoryABI from "@/lib/abi/SignetAccountFactory.abi.json";

export const signetFactory = {
  address: env.factoryAddress,
  abi: SignetFactoryABI,
} as const;

export const signetAccountFactory = {
  address: env.accountFactoryAddress,
  abi: SignetAccountFactoryABI,
} as const;

export function signetGroup(address: Address) {
  return {
    address,
    abi: SignetGroupABI,
  } as const;
}

export function signetAccount(address: Address) {
  return {
    address,
    abi: SignetAccountABI,
  } as const;
}
