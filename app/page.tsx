import type { Metadata } from "next";
import { SayOpenPrototype } from "./SayOpenPrototype";

export const metadata: Metadata = {
  title: "说开 SHUOKAI — 结构化沟通原型",
  description:
    "当聊天失效，换一种方式说开。一个帮助两个人准确表达、看见分歧并形成下一步的结构化沟通工具。",
};

export default function Home() {
  return <SayOpenPrototype />;
}
