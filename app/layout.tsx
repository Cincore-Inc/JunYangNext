import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = { title: "浚杨建筑管理系统", description: "项目与财务管理工作台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AntdRegistry>{children}</AntdRegistry></body></html>;
}
