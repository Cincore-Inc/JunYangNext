"use client";

import { useState } from "react";
import Image from "next/image";
import { Alert, Button, ConfigProvider, Form, Input } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";
import "./style.css";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const login = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "登录失败");
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
      setLoading(false);
    }
  };
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#286b85", borderRadius: 8 } }}>
    <main className="login-page">
      <div className="login-visual" aria-hidden="true"><div className="visual-caption"><p>浚杨建筑</p><span>管理系统</span></div></div>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel-inner">
          <div className="login-brand"><Image src="/brand/logo.png" alt="" width={42} height={42} priority /><div><strong>浚杨建筑</strong><span>管理系统</span></div></div>
          <div className="login-heading"><h1 id="login-title">登录</h1><p>请输入账号和密码，进入管理系统</p></div>
          {error && <Alert className="login-error" type="error" showIcon message={error} />}
          <Form layout="vertical" onFinish={login} requiredMark={false} autoComplete="on">
            <Form.Item label="账号" name="username" rules={[{ required: true, whitespace: true, message: "请输入账号" }]}><Input size="large" prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" maxLength={30} /></Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}><Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" maxLength={30} /></Form.Item>
            <Button block size="large" type="primary" htmlType="submit" loading={loading}>登 录</Button>
          </Form>
        </div>
        <footer className="login-footer">浚杨建筑管理系统</footer>
      </section>
    </main>
  </ConfigProvider>;
}
