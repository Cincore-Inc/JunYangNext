"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Alert, App, AutoComplete, Button, Card, ConfigProvider, DatePicker, Descriptions, Drawer, Dropdown, Empty, Form, Image as AntImage, Input, InputNumber, Popconfirm, Select, Space, Switch, Table, Tabs, Tree, Upload } from "antd";
import { AppstoreOutlined, FileTextOutlined, FolderOpenOutlined, TeamOutlined, WalletOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, IdcardOutlined } from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import type { DataNode } from "antd/es/tree";
import type { ColumnType } from "antd/es/table";
import Money from "@/app/components/money";
import StatusTag from "@/app/components/status-tag";
import PersonnelDetails from "@/app/components/personnel-details";
import CompanyPage from "@/app/components/company-page";
import { AccessContext, useAccess, type Access } from "@/app/components/access";
import ExamPage from "@/app/components/exam-page";
import FormDrawer from "@/app/components/form-drawer";
import TransferRecords from "@/app/components/transfer-records";
import StaffAssets from "@/app/components/staff-assets";
import StaffInsurance from "@/app/components/staff-insurance";
import StaffHistory from "@/app/components/staff-history";
import StaffRecords from "@/app/components/staff-records";
import ProjectEdit from "@/app/components/project-edit";
import ProjectCompanies from "@/app/components/project-companies";
import InvoiceSummary from "@/app/components/invoice-summary";
import StringDatePicker from "@/app/components/string-date-picker";
import FileEditor, { type EditableFile } from "@/app/components/file-editor";
import FileCategories from "@/app/components/file-categories";

const ProLayout = dynamic(() => import("@ant-design/pro-components").then((module) => module.ProLayout), { ssr: false });
type Totals = { count: number; amount: number };
type Project = { id: string; name: string; number: number | null; status: string; bidStatus: string; bidders: string; projectType: string; bidMethod: string; bidStartTime: string | null; projectStart: string | null; projectEnd: string | null; todo: string; bidderCompanies: string; notes: string; docFeeTotal: number; commissionTotal: number; depositTotal: number; winner: string; updatedAt: string | null; editor: string; received: Totals; issued: Totals };
type Attachment = { field: string; index: number; label: string; extension?: string };
type Invoice = { id: string; number: string; date: string | null; company: string; party: string; amount: number; ticketStatus: string; status: string; files: Attachment[] };
type FinanceItem = { id: string; index: number | null; projectNumber: number | null; taxRate: string; verifiedAt: string | null; projectId: string; companyId: string; project: string; company: string; amount: number; amountWithoutTax: number; tax: number; party: string; ticketClass: string; date: string | null; updatedAt: string | null; number: string; ticketStatus: string; status: string; direction: string; type: string; title: string; name: string; accountName: string; channel: string; oppositeName: string; oppositeAccountName: string; oppositeChannel: string; note: string; todo: string; person: string; receiptType: string; storagePlace: string; tags: string; purpose: string; taxCode: string; issueDate: string | null; deductDate: string | null; submitDate: string | null; files: Attachment[] };
type Detail = { permissions: { bills: boolean; files: boolean }; project: { name: string; number: number | null; status: string; address: string; caller: string; createdAt: string | null; updatedAt: string | null; lastEditedBy: string; callerContact: string; callerPhone: string; callerBank: string; callerBankAccount: string; winnerOther: string; managementFee: number | null; tax: number | null; taxDeductRatio: string; materialRatio: string; laborRatio: string; projectStart: string | null; projectEnd: string | null; todo: string; fileNote: string; bidders: string[]; phone: string; bidMethod: string; bidStatus: string; bidAddress: string; bidStartTime: string | null; bidLimit: number | null; requireOriginalFiles: boolean | null; bids: string[]; bidderCompanies: { _id?: string; name?: string; staff?: string; docFee?: number; commission?: number; applicationFee?: number; deposit?: number; depositRefundDate?: string; creditReportFee?: number; letterFee?: number; showPerson?: string; showFee?: number; otherFee?: number; note?: string }[]; winner: { value?: string; label?: string; name?: string } | string | null; winnerPrice: number | null; projectType: string; description: string; notes: string; tags: string[]; files: Attachment[] }; receipts: Invoice[]; invoices: Invoice[] };
const date = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "—";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(",", "") : "—";
const menu = [
  { path: "/", name: "工作台", icon: <AppstoreOutlined /> },
  { path: "/project-menu", name: "项目管理", icon: <FolderOpenOutlined />, routes: [{ path: "/projects", name: "投标项目" }, { path: "/projects-won", name: "中标项目" }] },
  { path: "/finance", name: "财务管理", icon: <WalletOutlined />, routes: [
    { path: "/transactions", name: "交易明细" },
    { path: "/transaction-summary", name: "交易明细概览" },
    { path: "/issued", name: "开票" },
    { path: "/received", name: "收票" },
    { path: "/invoice-summary", name: "票据概览" },
  ] },
  { path: "/files", name: "文件管理", icon: <FolderOpenOutlined /> },
  { path: "/companies", name: "公司管理", icon: <FolderOpenOutlined /> },
  { path: "/people", name: "人员管理", icon: <IdcardOutlined />, routes: [
    { path: "/staff", name: "人员列表" }, { path: "/staff-salary", name: "人员工资" }, { path: "/staff-insurance", name: "人员社保" }, { path: "/staff-certificates", name: "证件审核" }, { path: "/staff-exams", name: "考试信息" },
  ] },
  { path: "/users", name: "账号管理", icon: <TeamOutlined /> },
];
const labels: Record<string, string> = { "/": "工作台", "/projects": "投标项目", "/projects-won": "中标项目", "/invoices": "发票管理", "/transactions": "交易明细", "/transaction-summary": "交易明细概览", "/issued": "开票", "/received": "收票", "/invoice-summary": "票据概览", "/users": "账号管理", "/files": "文件管理", "/companies": "公司管理", "/permissions": "账号管理", "/staff": "人员列表", "/staff-salary": "人员工资", "/staff-insurance": "人员社保", "/staff-certificates": "证件审核", "/staff-exams": "考试信息" };
async function readJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const body = await response.json();
  if (response.status === 401) window.location.replace("/login");
  if (!response.ok) throw new Error(body.error || "读取数据失败");
  return body;
}
export default function Home() {
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "error">("loading");
  const [displayName, setDisplayName] = useState("");
  const [access, setAccess] = useState<Access>({ permissions: {}, administrator: false, canManageRoles: false });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (response.ok) { const profile = await response.json(); setDisplayName(profile.name || profile.username || "当前用户"); setAccess({ permissions: profile.permissions, administrator: profile.administrator, canManageRoles: profile.canManageRoles }); }
      setSessionState(response.ok ? "ready" : "error");
    }).catch((error) => { if (error.name !== "AbortError") setSessionState("error"); });
    return () => controller.abort();
  }, []);
  const currentPath = () => {
    if (typeof window === "undefined") return "/";
    const value = new URLSearchParams(window.location.search).get("view");
    const candidate = value ? `/${value}` : "/";
    return candidate in labels ? candidate : "/";
  };
  const [path, setPath] = useState(currentPath);
  const [selected, setSelected] = useState<Project | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => { const onPopState = () => { setPath(currentPath()); setSelected(null); }; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  const navigate = (next: string) => { setSelected(null); setPath(next); if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true); window.history.pushState(null, "", next === "/" ? "/" : `/?view=${encodeURIComponent(next.slice(1))}`); };
  const required: Record<string, string[]> = { "/projects": ["project_all_view"], "/projects-won": ["project_all_view"], "/transactions": ["finance_view"], "/transaction-summary": ["finance_view"], "/invoices": ["finance_view"], "/received": ["finance_view"], "/issued": ["finance_view"], "/invoice-summary": ["finance_view"], "/files": ["file_view"], "/staff": ["staff_view"], "/staff-salary": ["salarydetail_view"], "/staff-insurance": ["insurancedetail_view"], "/staff-certificates": ["certificate_view"], "/staff-exams": ["exam_view"], "/users": ["user_view", "group_view"], "/permissions": ["group_view"] };
  const allowed = (key: string) => access.administrator || !required[key] || required[key].some((permission) => access.permissions[permission] === true);
  const visibleMenu = menu.map((item) => item.routes ? { ...item, routes: item.routes.filter((route) => allowed(route.path)) } : item).filter((item) => item.routes ? item.routes.length > 0 : allowed(item.path));
  if (sessionState === "loading") return <div className="session-state">正在检查登录状态...</div>;
  if (sessionState === "error") return <div className="session-state"><Alert type="error" showIcon message="登录服务暂时不可用" description="请检查连接后重试。" /><Button onClick={() => window.location.reload()}>重试</Button></div>;
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#286b85", colorLink: "#286b85", colorLinkHover: "#47879e", colorLinkActive: "#20576d", colorInfo: "#286b85", borderRadius: 8, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' } }}><App><AccessContext.Provider value={access}>
    <ProLayout colorPrimary="#286b85" title="浚杨建筑管理系统" logo={<Image src="/brand/logo.png" alt="" width={32} height={32} />} layout="mix" navTheme="light" fixSiderbar collapsed={collapsed} onCollapse={setCollapsed} location={{ pathname: path }} route={{ path: "/", routes: visibleMenu }}
      menuItemRender={(item, dom) => item.path === "/finance" || item.path === "/people" || item.path === "/project-menu" ? dom : <a href={item.path === "/" ? "/" : `/?view=${encodeURIComponent((item.path || "").slice(1))}`} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); if (item.path) navigate(item.path); }}>{dom}</a>}
      avatarProps={{ icon: <TeamOutlined />, title: displayName }} actionsRender={() => [<Button key="logout" type="text" onClick={async () => { const response = await fetch("/api/session", { method: "DELETE" }); if (response.ok) window.location.replace("/login"); }}>退出登录</Button>]} menuHeaderRender={false}>
      <PageContainer title={false} breadcrumbRender={false}>
        {!allowed(path) ? <Alert type="warning" showIcon message="当前账号没有访问此页面的权限" /> : path === "/" ? <Card variant="borderless" className="panel"><h2>欢迎使用浚杨建筑管理系统</h2><p>在这里查询项目、核对发票和交易明细，管理人员、账号与资料。</p><Space wrap>{allowed("/projects") && <Button onClick={() => navigate("/projects")}>项目管理</Button>}{allowed("/transactions") && <Button onClick={() => navigate("/transactions")}>交易明细</Button>}{allowed("/received") && <Button onClick={() => navigate("/received")}>收票</Button>}{allowed("/staff") && <Button onClick={() => navigate("/staff")}>人员管理</Button>}</Space></Card> : ["/projects", "/projects-won"].includes(path) ? <><Projects key={path} won={path === "/projects-won"} onSelect={setSelected} externalRevision={projectRevision} /><Drawer title="项目详情" width="min(1100px, 100vw)" open={!!selected} onClose={() => setSelected(null)} destroyOnHidden>{selected && <ProjectDetail selected={selected} onUpdated={() => setProjectRevision((value) => value + 1)} />}</Drawer></> : path === "/invoice-summary" ? <InvoiceSummary /> : path === "/transaction-summary" ? <FinanceSummary transactions /> : ["/invoices", "/transactions", "/issued", "/received"].includes(path) ? <Finance key={path} transactions={path === "/transactions"} initialKind={path === "/issued" ? "invoices" : "receipts"} /> : path === "/files" ? <FilesPage /> : path === "/companies" ? <CompanyPage /> : path === "/staff" ? <StaffPage /> : path === "/staff-exams" ? <ExamPage /> : path === "/staff-salary" || path === "/staff-insurance" || path === "/staff-certificates" ? <PersonnelDetails key={path} kind={path === "/staff-salary" ? "salary" : path === "/staff-insurance" ? "insurance" : "certificates"} /> : <AccountManagement initial={path === "/permissions" ? "groups" : "users"} />}
      </PageContainer>
    </ProLayout>
  </AccessContext.Provider></App></ConfigProvider>;
}

function Projects({ onSelect, won, externalRevision }: { onSelect: (project: Project) => void; won: boolean; externalRevision: number }) {
  const { can, any } = useAccess();
  const { message } = App.useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [notePreview, setNotePreview] = useState<{ name: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [winnerInput, setWinnerInput] = useState<{ value: string; label: string } | undefined>(); const [winnerOptions, setWinnerOptions] = useState<{ value: string; label: string }[]>([]); const winnerRequest = useRef(0); const [bidderInput, setBidderInput] = useState(""); const [fromInput, setFromInput] = useState(""); const [toInput, setToInput] = useState("");
  const [numberInput, setNumberInput] = useState("");
  const [finishFromInput, setFinishFromInput] = useState(""); const [finishToInput, setFinishToInput] = useState("");
  const [extra, setExtra] = useState({ winnerId:"", winnerLabel:"", bidder:"", from:"", to:"", endFrom:"", endTo:"", number:"" });
  const [sort, setSort] = useState("createdDesc");
  const [tableFilters, setTableFilters] = useState<{ bidStatuses: string[]; bidMethods: string[] }>({ bidStatuses: [], bidMethods: [] });
  const [syncing, setSyncing] = useState("");
  const [data, setData] = useState<{ total: number; statuses: string[]; projects: Project[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readJSON<{ total: number; statuses: string[]; projects: Project[] }>(`/api/projects?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&sort=${encodeURIComponent(sort)}&won=${won ? "1" : "0"}&${new URLSearchParams({ ...extra, bidStatuses: tableFilters.bidStatuses.join(","), bidMethods: tableFilters.bidMethods.join(",") })}`, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, query, status, sort, revision, won, extra, tableFilters, externalRevision]);
  const findWinners = async (q = "") => { const current = ++winnerRequest.current; try { const result = await readJSON<{ items: { value: string; label: string }[] }>(`/api/projects/options?${new URLSearchParams({ q })}`); if (current === winnerRequest.current) setWinnerOptions(result.items); } catch (e) { if (current === winnerRequest.current) setError(e instanceof Error ? e.message : "无法读取公司选项"); } };
  const search = useCallback(() => { setLoading(true); setError(""); setPage(1); setQuery(input.trim()); setStatus(statusInput); setExtra({ winnerId:winnerInput?.value || "", winnerLabel:winnerInput?.label || "", bidder:bidderInput, from:fromInput, to:toInput, endFrom:finishFromInput, endTo:finishToInput, number:numberInput.trim() }); setRevision((n) => n + 1); }, [input, statusInput, winnerInput, bidderInput, fromInput, toInput, finishFromInput, finishToInput, numberInput]);
  return <div className="dashboard project-dashboard">
    <Card variant="borderless" className="panel filter-panel">
      <div className="toolbar"><div className="filter-field"><label htmlFor="project-search">项目</label><Input id="project-search" placeholder="搜索项目、投标人、公司或备注" prefix={<SearchOutlined />} value={input} onChange={(e) => setInput(e.target.value)} onPressEnter={search} allowClear /></div><div className="filter-field"><label htmlFor="project-status">项目状态</label><Select id="project-status" aria-label="项目状态" value={statusInput} onChange={setStatusInput} options={[{ value: "", label: "全部状态" }, ...(data?.statuses || []).map((value) => ({ value, label: value })), { value: "__unset__", label: "未设置状态" }]} /></div>
        <div className="filter-field"><label htmlFor="project-winner">中标公司</label><Select id="project-winner" showSearch allowClear labelInValue filterOption={false} placeholder="搜索公司名称" value={winnerInput} onFocus={() => findWinners()} onSearch={findWinners} onChange={setWinnerInput} options={winnerOptions} /></div>{!won && <div className="filter-field"><label htmlFor="project-bidder">投标公司</label><Input id="project-bidder" value={bidderInput} onChange={(e) => setBidderInput(e.target.value)} allowClear /></div>}<div className="filter-field"><label>{won ? "开工日期" : "开标日期"}</label><DatePicker.RangePicker aria-label={won ? "开工日期范围" : "开标日期范围"} allowEmpty={[true, true]} value={[fromInput ? dayjs(fromInput) : null, toInput ? dayjs(toInput) : null]} onChange={(value) => { setFromInput(value?.[0]?.format("YYYY-MM-DD") || ""); setToInput(value?.[1]?.format("YYYY-MM-DD") || ""); }} /></div>
        {won && <div className="filter-field"><label htmlFor="project-number">项目编号</label><Input id="project-number" inputMode="numeric" value={numberInput} onChange={(e) => setNumberInput(e.target.value)} onPressEnter={search} allowClear /></div>}{won && <div className="filter-field"><label>完工日期</label><DatePicker.RangePicker aria-label="完工日期范围" allowEmpty={[true, true]} value={[finishFromInput ? dayjs(finishFromInput) : null, finishToInput ? dayjs(finishToInput) : null]} onChange={(value) => { setFinishFromInput(value?.[0]?.format("YYYY-MM-DD") || ""); setFinishToInput(value?.[1]?.format("YYYY-MM-DD") || ""); }} /></div>}<Space><Button type="primary" onClick={search}>查询</Button><Button onClick={() => { setLoading(true); setError(""); setInput(""); setQuery(""); setStatus(""); setStatusInput(""); setWinnerInput(undefined); setBidderInput(""); setFromInput(""); setToInput(""); setFinishFromInput(""); setFinishToInput(""); setNumberInput(""); setExtra({winnerId:"",winnerLabel:"",bidder:"",from:"",to:"",endFrom:"",endTo:"",number:""}); setTableFilters({bidStatuses:[],bidMethods:[]}); setPage(1); setRevision((n) => n + 1); }}>重置</Button></Space></div>
    </Card>
    <Card variant="borderless" className="panel project-panel">
      {can("project_add") && <div className="table-actions"><Button type="primary" onClick={() => { setNewName(""); setCreating(true); }}>新增项目</Button></div>}
      <FormDrawer title="新增项目" open={creating} confirmLoading={saving} onCancel={() => setCreating(false)} onOk={async () => { if (!newName.trim()) { message.error("请输入项目名称"); return; } try { setSaving(true); const response = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:newName }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "创建失败"); message.success("项目已创建，可打开详情继续完善"); setCreating(false); setLoading(true); setRevision((n) => n+1); } catch (e) { message.error(e instanceof Error ? e.message : "创建失败"); } finally { setSaving(false); } }}><Form layout="vertical"><Form.Item label="项目名称" required><Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} /></Form.Item></Form></FormDrawer>
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => { setLoading(true); setError(""); setRevision((n) => n + 1); }}>重试</Button>} className="error" />}
      <Table<Project> rowKey="id" onChange={(_, selectedFilters, sorter, extra) => {
        if (extra.action === "filter") { setLoading(true); setError(""); setPage(1); setTableFilters({ bidStatuses: (selectedFilters.bidStatus || []).map(String), bidMethods: (selectedFilters.bidMethod || []).map(String) }); return; }
        if (extra.action !== "sort") return;
        const selected = Array.isArray(sorter) ? sorter[0] : sorter;
        const fields: Record<string, string> = { name: "name", number: "number", updatedAt: "updated" };
        const field = fields[String(selected.field)];
        if (field && selected.order) { setLoading(true); setError(""); setPage(1); setSort(field + (selected.order === "ascend" ? "Asc" : "Desc")); }
      }} loading={loading} dataSource={data?.projects || []} scroll={{ x: won ? 2100 : 2680 }} pagination={{ current: page, pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [2, 25, 50, 100, 200, 300, 400], showTotal: (total) => `共 ${total} 条`, onChange: (nextPage, nextSize) => { setLoading(true); setError(""); setPage(nextSize === pageSize ? nextPage : 1); setPageSize(nextSize); } }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "数据暂不可用" : "没有找到项目"} /> }} columns={([
        { title: "项目名称", dataIndex: "name", sorter: true, sortDirections: ["descend", "ascend", "descend"], sortOrder: sort.startsWith("name") ? (sort.endsWith("Asc") ? "ascend" : "descend") : null, width: 280, render: (name, row) => can("project_detail") ? <Button type="link" className="project-link" onClick={() => onSelect(row)}>{name}</Button> : name },
        { title: "项目编号", dataIndex: "number", sorter: true, sortDirections: ["descend", "ascend", "descend"], sortOrder: sort.startsWith("number") ? (sort.endsWith("Asc") ? "ascend" : "descend") : null, width: 120, render: (value) => value ?? "—" },
        { title: "投标人", dataIndex: "bidders", width: 150, render: (value) => value || "—" }, { title: "中标状态", dataIndex: "bidStatus", width: 120, ...(!won ? { filters: ["投标中", "已中标", "未中标"].map((value) => ({ text: value, value })), filteredValue: tableFilters.bidStatuses.length ? tableFilters.bidStatuses : null } : {}), render: (value) => <StatusTag value={value} /> }, { title: "中标公司", dataIndex: "winner", width: 180, render: (value) => value || "—" }, { title: "项目类型", dataIndex: "projectType", width: 120, render: (value) => value || "—" }, ...(won ? [{ title: "开工日期", dataIndex: "projectStart", width: 120, render: date }, { title: "完工日期", dataIndex: "projectEnd", width: 120, render: date }, { title: "待办事项", dataIndex: "todo", width: 200, render: (value: string) => value ? <span className="table-note" title={value}>{value}</span> : "—" }] : [{ title: "中标方式", dataIndex: "bidMethod", width: 140, filters: ["低价中标", "邀标低价", "库内低价", "抽选", "电子标", "综合评选"].map((value) => ({ text: value, value })), filteredValue: tableFilters.bidMethods.length ? tableFilters.bidMethods : null, render: (value: string) => value || "—" }, { title: "开标时间", dataIndex: "bidStartTime", width: 190, className: "nowrap-cell", render: dateTime }, { title: "投标公司", dataIndex: "bidderCompanies", width: 200, render: (value: string) => value || "—" }, { title: "资料费", dataIndex: "docFeeTotal", width: 120, render: (value: number) => <Money value={value} /> }, { title: "提成", dataIndex: "commissionTotal", width: 120, render: (value: number) => <Money value={value} /> }, { title: "投标保证金", dataIndex: "depositTotal", width: 140, render: (value: number) => <Money value={value} /> }]), { title: "编辑人", dataIndex: "editor", width: 110, render: (value) => value || "—" }, { title: "备注", dataIndex: "notes", width: 260, render: (value: string, row) => value ? <button type="button" className="table-note-button" aria-label={`查看${row.name}的备注`} onClick={() => setNotePreview({ name: row.name, text: value })}><span className="table-note">{value}</span></button> : "—" }, { title: "状态", dataIndex: "status", width: 110, render: (value: string) => <StatusTag value={value} /> },
        { title: "收到发票（含税）", dataIndex: "received", width: 170, render: (value: Totals) => <span><Money value={value.amount} /><small className="sub">{value.count} 张</small></span> },
        { title: "开出发票（含税）", dataIndex: "issued", width: 170, render: (value: Totals) => <span><Money value={value.amount} /><small className="sub">{value.count} 张</small></span> },
        { title: "最近更新", dataIndex: "updatedAt", sorter: true, sortDirections: ["descend", "ascend", "descend"], sortOrder: sort.startsWith("updated") ? (sort.endsWith("Asc") ? "ascend" : "descend") : null, width: 120, render: date },
        { title: "操作", width: 180, fixed: "right", render: (_, row) => <Space size={4}>{can("project_detail") && <Button size="small" onClick={() => onSelect(row)}>详情</Button>}<Button size="small" loading={syncing === row.id} onClick={async () => { try { setSyncing(row.id); const response = await fetch(`/api/projects/${row.id}/sync-name`, { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "同步失败"); message.success("项目名称已同步"); setRevision((n) => n + 1); } catch (error) { message.error(error instanceof Error ? error.message : "同步失败"); } finally { setSyncing(""); } }}>同步名称</Button></Space> },
      ] satisfies ColumnType<Project>[]).filter((column) => (!won || column.dataIndex !== "bidStatus") && (any("finance_view", "project_bill_view") || !["received", "issued"].includes(String(column.dataIndex)))).sort((a, b) => {
        const order = won ? ["number", "status", "winner", "name", "editor", "bidders", "projectType", "projectStart", "projectEnd", "notes", "todo", "received", "issued", "updatedAt"] : ["name", "editor", "bidders", "bidStatus", "bidMethod", "bidStartTime", "bidderCompanies", "docFeeTotal", "commissionTotal", "depositTotal", "notes", "number", "status", "winner", "projectType", "received", "issued", "updatedAt"];
        return (order.indexOf(String(a.dataIndex)) < 0 ? order.length : order.indexOf(String(a.dataIndex))) - (order.indexOf(String(b.dataIndex)) < 0 ? order.length : order.indexOf(String(b.dataIndex)));
      })} />
    </Card><Drawer title="项目备注" open={notePreview !== null} onClose={() => setNotePreview(null)} width="min(600px, 100vw)" destroyOnHidden>{notePreview && <><div className="note-preview-project">{notePreview.name}</div><div className="note-preview-text">{notePreview.text}</div></>}</Drawer><div className="footer-note">浚杨建筑管理系统 · 工作台</div>
  </div>;
}


type FinanceSummaryItem = { id: number; type: string; ticketClass: string; direction: string; status: string; count: number; amount: number; tax: number; amountWithoutTax: number };
type TransactionMatrixItem = { id: number; name: string; outgoing: number; incoming: number; total: number; outgoingUnverified: number; incomingUnverified: number; unverifiedTotal: number; outgoingVerified: number; incomingVerified: number; verifiedTotal: number };
const transactionMatrixColumns = [["outgoing", "总支出"], ["incoming", "总收入"], ["total", "总合计"], ["outgoingUnverified", "未对账支出"], ["incomingUnverified", "未对账收入"], ["unverifiedTotal", "未对账合计"], ["outgoingVerified", "已对账支出"], ["incomingVerified", "已对账收入"], ["verifiedTotal", "已对账合计"]] as const;
type FinanceFiltersValue = { q: string; status: string; from: string; to: string; dateFrom: string; dateTo: string; issueFrom: string; issueTo: string; verifiedFrom: string; verifiedTo: string; deductFrom: string; deductTo: string; submitFrom: string; submitTo: string; direction: string; ticketStatus: string; dateField: string; type: string; project: string; company: string; filterProjectId: string; filterCompanyId: string; party: string; receiptType: string; purpose: string; taxCode: string };
const emptyFinanceFilters = (): FinanceFiltersValue => ({ q: "", status: "", from: "", to: "", dateFrom: "", dateTo: "", issueFrom: "", issueTo: "", verifiedFrom: "", verifiedTo: "", deductFrom: "", deductTo: "", submitFrom: "", submitTo: "", direction: "", ticketStatus: "", dateField: "", type: "", project: "", company: "", filterProjectId: "", filterCompanyId: "", party: "", receiptType: "", purpose: "", taxCode: "" });
function TransactionTypeInput({ id, value, onChange }: { id?: string; value?: string; onChange?: (value: string) => void }) {
  const { can } = useAccess();
  const { message } = App.useApp();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    if (loaded || !can("finance_view")) return;
    try { const result = await readJSON<{ items: { value: string; label: string }[] }>("/api/finance/options?kind=transactionTypes"); setOptions(result.items); setLoaded(true); }
    catch (error) { message.error(error instanceof Error ? error.message : "无法读取交易类型"); }
  };
  return <AutoComplete id={id} value={value} onChange={onChange} onFocus={load} options={options} allowClear filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())} placeholder="选择或输入交易类型"><Input maxLength={80} /></AutoComplete>;
}
function FinanceFilters({ transactions, receipt, onSearch, scoped = false }: { transactions: boolean; receipt: boolean; onSearch: (values: FinanceFiltersValue) => void; scoped?: boolean }) {
  const { can } = useAccess();
  const { message } = App.useApp();
  const [values, setValues] = useState(emptyFinanceFilters);
  const [projectOptions, setProjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const optionRequests = useRef({ projects: 0, companies: 0 });
  const findOptions = async (kind: "projects" | "companies", q = "") => { const current = ++optionRequests.current[kind]; try { const result = await readJSON<{ items: { value: string; label: string }[] }>(`/api/finance/options?${new URLSearchParams({ kind, q })}`); if (optionRequests.current[kind] === current) { const update = kind === "projects" ? setProjectOptions : setCompanyOptions; update(previous => [...new Map([...previous.filter(option => option.value === (kind === "projects" ? values.filterProjectId : values.filterCompanyId)), ...result.items].map(option => [option.value, option])).values()]); } } catch (e) { if (optionRequests.current[kind] === current) message.error(e instanceof Error ? e.message : "无法读取筛选选项"); } };
  const change = (name: keyof FinanceFiltersValue, value: string) => setValues((old) => ({ ...old, [name]: value }));
  return <Card variant="borderless" className="panel filter-panel"><div className="finance-filter-grid">
    <div className="filter-field"><label htmlFor="finance-search">关键词</label><Input id="finance-search" placeholder="项目、公司、票号或摘要" prefix={<SearchOutlined />} value={values.q} onChange={(e) => change("q", e.target.value)} onPressEnter={() => onSearch(values)} allowClear /></div>
    {!scoped && <div className="filter-field"><label htmlFor="finance-project">项目</label><Select id="finance-project" showSearch allowClear filterOption={false} placeholder="搜索项目" value={values.filterProjectId || undefined} options={projectOptions} onFocus={() => findOptions("projects")} onSearch={q => findOptions("projects", q)} onChange={value => change("filterProjectId", value || "")} /></div>}
    <div className="filter-field"><label htmlFor="finance-company">公司</label>{can("finance_view") ? <Select id="finance-company" showSearch allowClear filterOption={false} placeholder="搜索公司" value={values.filterCompanyId || undefined} options={companyOptions} onFocus={() => findOptions("companies")} onSearch={q => findOptions("companies", q)} onChange={value => change("filterCompanyId", value || "")} /> : <Input id="finance-company" value={values.company} onChange={e => change("company", e.target.value)} allowClear />}</div>
    <div className="filter-field"><label htmlFor="finance-party">{transactions ? "对方" : "购销方"}</label><Input id="finance-party" value={values.party} onChange={(e) => change("party", e.target.value)} allowClear /></div>
    <div className="filter-field"><label htmlFor="finance-status">对账状态</label><Select id="finance-status" aria-label="对账状态" value={values.status} onChange={(value) => change("status", value)} options={[{ value: "", label: "全部" }, { value: "已对账", label: "已对账" }, { value: "未对账", label: "未对账" }, { value: "未设置", label: "未设置" }]} /></div>
    {transactions ? <div className="filter-field"><label htmlFor="finance-direction">收支方向</label><Select id="finance-direction" aria-label="收支方向" value={values.direction} onChange={(value) => change("direction", value)} options={[{ value: "", label: "全部" }, { value: "income", label: "收入" }, { value: "outgoing", label: "支出" }]} /></div> : <div className="filter-field"><label htmlFor="finance-ticket">发票状态</label><Select id="finance-ticket" aria-label="发票状态" value={values.ticketStatus} onChange={(value) => change("ticketStatus", value)} options={[{ value: "", label: "全部" }, { value: "有效", label: "有效" }, { value: "作废", label: "作废" }, { value: "已抵扣", label: "已抵扣" }, { value: "未交票", label: "未交票" }, { value: "未设置", label: "未设置" }]} /></div>}
    <div className="filter-field"><label htmlFor="finance-type">{transactions ? "交易类型" : "发票种类"}</label>{transactions ? <TransactionTypeInput id="finance-type" value={values.type} onChange={value => change("type", value)} /> : <Select id="finance-type" mode="multiple" allowClear placeholder="全部" value={JSON.parse(values.type || "[]")} options={["专票", "普票"].map(value => ({ value, label: value }))} onChange={selected => change("type", selected.length ? JSON.stringify(selected) : "")} />}</div>
    {receipt && <div className="filter-field"><label htmlFor="finance-receipt-type">发票类型</label><Select id="finance-receipt-type" mode="multiple" allowClear placeholder="全部" value={JSON.parse(values.receiptType || "[]")} options={["工程票", "工资表", "预缴税"].map(value => ({ value, label: value }))} onChange={selected => change("receiptType", selected.length ? JSON.stringify(selected) : "")} /></div>}
    {!transactions && <div className="filter-field"><label htmlFor="finance-invoice-category">{receipt ? "发票用途" : "计税方式"}</label><Select id="finance-invoice-category" mode="multiple" allowClear placeholder="全部" value={JSON.parse((receipt ? values.purpose : values.taxCode) || "[]")} options={(receipt ? ["劳务成本", "材料成本", "抵增值税"] : ["简易计税", "一般计税"]).map(value => ({ value, label: value }))} onChange={selected => change(receipt ? "purpose" : "taxCode", selected.length ? JSON.stringify(selected) : "")} /></div>}
    {([['date', transactions ? '交易日期' : receipt ? '日期' : '开票日期'], ...(receipt && !transactions ? [['issue', '开票日期']] : []), ['verified', '对账日期'], ...(!transactions ? [['deduct', '抵扣日期'], ['submit', '做账日期']] : [])] as ["date" | "issue" | "verified" | "deduct" | "submit", string][]).map(([prefix, label]) => {
      const fromKey = `${prefix}From` as keyof FinanceFiltersValue, toKey = `${prefix}To` as keyof FinanceFiltersValue;
      return <div className="filter-field" key={prefix}><label>{label}</label><DatePicker.RangePicker aria-label={`${label}范围`} allowEmpty={[true, true]} value={[values[fromKey] ? dayjs(values[fromKey]) : null, values[toKey] ? dayjs(values[toKey]) : null]} onChange={range => setValues(old => ({ ...old, [fromKey]: range?.[0]?.format("YYYY-MM-DD") || "", [toKey]: range?.[1]?.format("YYYY-MM-DD") || "" }))} /></div>;
    })}
    <Space className="finance-filter-actions"><Button type="primary" onClick={() => onSearch(values)}>查询</Button><Button onClick={() => { const empty = emptyFinanceFilters(); setValues(empty); onSearch(empty); }}>重置</Button></Space>
  </div></Card>;
}
function FinanceSummary({ transactions, projectId }: { transactions: boolean; projectId?: string }) {
  const [kind, setKind] = useState(transactions ? "transactions" : "receipts");
  const [group, setGroup] = useState("type");
  const [filters, setFilters] = useState(emptyFinanceFilters);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<(FinanceSummaryItem & TransactionMatrixItem)[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    readJSON<{ items: (FinanceSummaryItem & TransactionMatrixItem)[] }>(`/api/finance/summary?${new URLSearchParams({ kind, group, ...filters, ...(transactions ? { mode: "transactionMatrix" } : {}), ...(projectId ? { projectId } : {}) })}`, controller.signal).then((value) => setItems(value.items)).catch((e) => { if (e.name !== "AbortError") { setItems([]); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, group, filters, revision, projectId, transactions]);
  return <div className="dashboard"><FinanceFilters key={kind} transactions={transactions} receipt={kind === "receipts"} scoped={!!projectId} onSearch={(values) => { setLoading(true); setError(""); setFilters(values); setRevision((n) => n + 1); }} /><Card variant="borderless" className="panel project-panel">
    {!transactions && <Tabs activeKey={kind} onChange={(value) => { setLoading(true); setError(""); setFilters(emptyFinanceFilters()); setKind(value); }} items={[{ key: "receipts", label: "收到发票" }, { key: "invoices", label: "开出发票" }]} />}
    <div className="table-actions"><Space><span>汇总维度</span><Select aria-label="汇总维度" value={group} style={{ width: 150 }} onChange={(value) => { setLoading(true); setError(""); setGroup(value); }} options={[{ value: "type", label: transactions ? "交易类型" : "发票种类" }, { value: "project", label: "项目" }, { value: "company", label: "公司" }, ...(transactions ? [{ value: "account", label: "收付款户名" }, { value: "opposite", label: "对方户名" }] : [])]} /></Space></div>
    <div className="summary-note">{transactions ? "按当前筛选条件汇总；金额仅计入已对账和未对账的收入、支出，未设置对账状态的记录不计入金额。" : "按当前筛选条件汇总；未限定状态时包含未对账和作废票据。"}</div>
    {error && <Alert className="error" type="error" showIcon message={error} />}
    {transactions ? <Table<TransactionMatrixItem> rowKey="id" loading={loading} dataSource={items} pagination={false} scroll={{ x: 1500 }} columns={[{ title: "名称", dataIndex: "name", width: 180 }, ...transactionMatrixColumns.map(([dataIndex, title]) => ({ title, dataIndex, width: 145, render: (value: number) => <Money value={value} /> }))]} summary={(rows) => <Table.Summary.Row><Table.Summary.Cell index={0}>合计</Table.Summary.Cell>{transactionMatrixColumns.map(([key], index) => <Table.Summary.Cell key={key} index={index + 1}><Money value={rows.reduce((sum, row) => sum + row[key], 0)} /></Table.Summary.Cell>)}</Table.Summary.Row>} /> : <Table<FinanceSummaryItem> rowKey="id" loading={loading} dataSource={items} pagination={false} scroll={{ x: 700 }} columns={[
      { title: group === "type" ? (transactions ? "类型" : "票据类型") : group === "project" ? "项目" : group === "company" ? "公司" : group === "account" ? "收付款户名" : "对方户名", dataIndex: "type" },
      ...(!transactions && group !== "type" ? [{ title: "票据类型", dataIndex: "ticketClass" }] : []),
      ...(transactions ? [{ title: "方向", dataIndex: "direction", render: (value: string) => value === "income" ? "收入" : value === "outgoing" ? "支出" : value || "未设置" }] : []),
      { title: "对账状态", dataIndex: "status", render: (value: string) => <StatusTag value={value} /> }, { title: "记录数", dataIndex: "count" },
      ...(!transactions ? [{ title: "不含税金额", dataIndex: "amountWithoutTax", render: (value: number) => <Money value={value} /> }, { title: "税额", dataIndex: "tax", render: (value: number) => <Money value={value} /> }] : []),
      { title: transactions ? "金额" : "含税金额", dataIndex: "amount", render: (value: number) => <Money value={value} /> },
    ]} />}
  </Card></div>;
}

function Finance({ transactions, initialKind, projectId, projectName }: { transactions: boolean; initialKind: string; projectId?: string; projectName?: string }) {
  const { can } = useAccess();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<FinanceItem | null>(null);
  const [noteRow, setNoteRow] = useState<FinanceItem | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([]);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<FinanceItem | null>(null);
  const kind = transactions ? "transactions" : initialKind;
  const [filters, setFilters] = useState(emptyFinanceFilters);
  const [sort, setSort] = useState("createdDesc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<{ total: number; summary: { amount: number; amountWithoutTax: number; tax: number }; items: FinanceItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, page: String(page), pageSize: String(pageSize), ...filters, sort, ...(projectId ? { projectId } : {}) });
    readJSON<{ total: number; summary: { amount: number; amountWithoutTax: number; tax: number }; items: FinanceItem[] }>(`/api/finance?${params}`, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, page, pageSize, filters, sort, revision, projectId]);
  const resetLoading = () => { setLoading(true); setError(""); setPage(1); };
  const saveTransaction = async () => {
    try {
      const values = await form.validateFields();
      if (editing) { if (!editing.date && !values.date) delete values.date; if (!editing.type && !values.type) delete values.type; if (!editing.number && !values.number) delete values.number; if (!values.projectId || values.projectId === editing.projectId) delete values.projectId; if (!values.companyId || values.companyId === editing.companyId) delete values.companyId; if ((values.verifiedAt || "") === (editing.verifiedAt ? date(editing.verifiedAt).replaceAll("/", "-") : "")) delete values.verifiedAt; }
      setSaving(true);
      const response = await fetch(creating ? "/api/finance/create" : transactions ? "/api/finance/transaction" : "/api/finance/invoice", { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, id: editing?.id, updatedAt: editing?.updatedAt, kind }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      message.success("财务信息已保存"); setEditing(null); setCreating(false); resetLoading(); setRevision((n) => n + 1);
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  const searchOptions = async (type: "projects" | "companies", q: string) => {
    try { const result = await readJSON<{ items: { value: string; label: string }[] }>(`/api/finance/options?${new URLSearchParams({ kind: type, q })}`); if (type === "projects") setProjects(result.items); else setCompanies(result.items); }
    catch (e) { message.error(e instanceof Error ? e.message : "无法读取选项"); }
  };
  const createFinance = async () => {
    await Promise.all([searchOptions("projects", ""), searchOptions("companies", "")]);
    form.resetFields(); form.setFieldsValue({ date: date(new Date().toISOString()).replaceAll("/", "-"), status: "未对账", ticketStatus: "有效", party: "", ticketClass: kind === "invoices" ? "专票" : "", receiptType: kind === "receipts" ? "工程票" : "", taxCode: kind === "invoices" ? "一般计税" : "", title: "", ...(projectId ? { projectId } : {}) }); setCloning(false); setCreating(true);
  };
  const editFinance = async (row: FinanceItem) => {
    await Promise.all([searchOptions("projects", ""), searchOptions("companies", "")]);
    if (row.projectId) setProjects(previous => [...new Map([...previous, { value: row.projectId, label: row.project }].map(option => [option.value, option])).values()]);
    if (row.companyId) setCompanies(previous => [...new Map([...previous, { value: row.companyId, label: row.company }].map(option => [option.value, option])).values()]);
    form.resetFields();
    form.setFieldsValue({ ...row, projectId: row.projectId || undefined, companyId: row.companyId || undefined, date: row.date ? date(row.date).replaceAll("/", "-") : "", issueDate: row.issueDate ? date(row.issueDate).replaceAll("/", "-") : "", deductDate: row.deductDate ? date(row.deductDate).replaceAll("/", "-") : "", submitDate: row.submitDate ? date(row.submitDate).replaceAll("/", "-") : "", verifiedAt: row.verifiedAt ? date(row.verifiedAt).replaceAll("/", "-") : "", amount: (row.amount / 100).toFixed(2), amountWithoutTax: (row.amountWithoutTax / 100).toFixed(2), tax: (row.tax / 100).toFixed(2), status: row.status || "未设置" });
    setEditing(row);
  };
  const cloneInvoice = async (row: FinanceItem) => {
    await Promise.all([searchOptions("projects", ""), searchOptions("companies", "")]);
    if (row.projectId) setProjects(previous => [...new Map([...previous, { value: row.projectId, label: row.project }].map(option => [option.value, option])).values()]);
    if (row.companyId) setCompanies(previous => [...new Map([...previous, { value: row.companyId, label: row.company }].map(option => [option.value, option])).values()]);
    form.resetFields();
    form.setFieldsValue({ ...row, projectId: projectId || row.projectId || undefined, companyId: row.companyId || undefined, date: row.date ? date(row.date).replaceAll("/", "-") : "", issueDate: row.issueDate ? date(row.issueDate).replaceAll("/", "-") : "", deductDate: row.deductDate ? date(row.deductDate).replaceAll("/", "-") : "", submitDate: "", index: null, storagePlace: "", number: "", amountWithoutTax: "0.00", tax: "0.00", status: "未对账", ticketStatus: row.ticketStatus === "未设置" ? "有效" : row.ticketStatus });
    setCloning(true); setCreating(true);
  };
  return <div className="dashboard"><FinanceFilters transactions={transactions} receipt={kind === "receipts"} scoped={!!projectId} onSearch={(values) => { resetLoading(); setFilters(values); setRevision((n) => n + 1); }} /><Card variant="borderless" className="panel project-panel">
    {can("finance_view") && <div className="table-actions"><Button type="primary" onClick={createFinance}>{transactions ? "新增交易" : kind === "receipts" ? "新增收票" : "新增开票"}</Button></div>}
    {!transactions && <div className="summary-note">列表包含所有发票状态，包括作废及未对账记录。</div>}
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => { setLoading(true); setError(""); setRevision((n) => n + 1); }}>重试</Button>} className="error" />}
    <Table<FinanceItem> rowKey="id" onChange={(_, __, sorter, extra) => {
      if (extra.action !== "sort") return;
      const selected = Array.isArray(sorter) ? sorter[0] : sorter;
      if ((selected.field === "date" || selected.field === "amount") && selected.order) {
        resetLoading(); setSort(selected.field + (selected.order === "ascend" ? "Asc" : "Desc"));
      }
    }} loading={loading} dataSource={data?.items || []} scroll={{ x: "max-content" }} summary={() => data && <Table.Summary><Table.Summary.Row><Table.Summary.Cell index={0} colSpan={transactions ? 17 : kind === "receipts" ? 27 : 23}><Space wrap size={24}><strong>筛选合计（{data.total} 条）</strong>{!transactions && <><span>不含税金额：<Money value={data.summary.amountWithoutTax} /></span><span>税额：<Money value={data.summary.tax} /></span></>}<span>{transactions ? "交易金额" : "含税金额"}：<Money value={data.summary.amount} /></span></Space></Table.Summary.Cell></Table.Summary.Row></Table.Summary>} pagination={{ current: page, pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [2, 25, 50, 100, 200, 300, 400], showTotal: (total) => `共 ${total} 条`, onChange: (value, size) => { setLoading(true); setError(""); setPage(size === pageSize ? value : 1); setPageSize(size); } }} columns={[
      { title: "日期", dataIndex: "date", sorter: true, sortDirections: ["descend", "ascend", "descend"], sortOrder: sort.startsWith("date") ? (sort.endsWith("Asc") ? "ascend" : "descend") : null, width: 110, render: date },
      { title: "项目", dataIndex: "project", width: 250 },
      { title: "公司", dataIndex: "company", width: 150 },
      ...(transactions ? [{ title: "类型", dataIndex: "type", width: 110 }, { title: "方向", dataIndex: "direction", width: 90, render: (value: string) => <StatusTag value={value === "income" ? "收入" : value === "outgoing" ? "支出" : value} /> }, { title: "摘要", dataIndex: "title", width: 180 }] : [{ title: "发票号码", dataIndex: "number", width: 180, render: (value: string) => value || "—" }, { title: "发票状态", dataIndex: "ticketStatus", width: 100, render: (value: string) => <StatusTag value={value} /> }]),
      ...(transactions ? [
        { title: "收付款户名", dataIndex: "accountName", width: 160 },
        { title: "收付款渠道", dataIndex: "channel", width: 160 },
        { title: "对方户名", dataIndex: "oppositeAccountName", width: 160 },
        { title: "对方渠道", dataIndex: "oppositeChannel", width: 160 },
      ] : [
        { title: "发票序号", dataIndex: "index", width: 110 },
        { title: "工程编号", dataIndex: "projectNumber", width: 110 },
        { title: "标签", dataIndex: "tags", width: 140, render: (value: string) => value || "—" },
        ...(kind === "receipts" ? [{ title: "名目", dataIndex: "title", width: 160, render: (value: string) => value || "—" }] : []),
        { title: kind === "receipts" ? "开票方" : "购票方", dataIndex: "party", width: 180 },
        { title: "发票种类", dataIndex: "ticketClass", width: 120 },
        { title: "不含税金额", dataIndex: "amountWithoutTax", width: 140, render: (value: number) => <Money value={value} /> },
        { title: "税额", dataIndex: "tax", width: 140, render: (value: number) => <Money value={value} /> },
        { title: "税率", dataIndex: "taxRate", width: 100 },
        ...(kind === "receipts" ? [{ title: "开票日期", dataIndex: "issueDate", width: 120, render: date }] : []),
        { title: "抵扣月份", dataIndex: "deductDate", width: 120, render: date },
        { title: "做账月份", dataIndex: "submitDate", width: 120, render: date },
        ...(kind === "receipts" ? [{ title: "交票人", dataIndex: "person", width: 120 }, { title: "发票类型", dataIndex: "receiptType", width: 120 }, { title: "发票用途", dataIndex: "purpose", width: 140 }] : [{ title: "计税方式", dataIndex: "taxCode", width: 120 }]),
      ]),
      { title: "备注", dataIndex: "note", width: 180, render: (value: string) => value ? <span className="table-note" title={value}>{value}</span> : "—" },
      { title: "待办", dataIndex: "todo", width: 160 },
      { title: "对账日期", dataIndex: "verifiedAt", width: 120, render: date },
      { title: "附件", dataIndex: "files", width: 150, render: (files: Attachment[], row: FinanceItem) => <AttachmentLinks files={files} id={row.id} kind={kind} onUploaded={transactions && row.status === "已对账" ? undefined : () => { setLoading(true); setRevision((n) => n + 1); }} /> },
      { title: "金额（元）", dataIndex: "amount", sorter: true, sortDirections: ["descend", "ascend", "descend"], sortOrder: sort.startsWith("amount") ? (sort.endsWith("Asc") ? "ascend" : "descend") : null, width: 140, render: (value: number) => <Money value={value} /> },
      { title: "对账状态", dataIndex: "status", width: 110, render: (value: string) => <StatusTag value={value} /> },
      { title: "操作", width: !can("finance_view") ? 88 : transactions ? 140 : 240, fixed: "right", render: (_, row) => <Space size={4} style={{ whiteSpace: "nowrap" }}><Button size="small" onClick={() => setSelected(row)}>详情</Button>{!transactions && can("finance_view") && <Button size="small" onClick={() => cloneInvoice(row)}>复制</Button>}{can("finance_view") && row.status === "已对账" && row.updatedAt && <Button size="small" onClick={() => { setNote(row.note); setNoteRow(row); }}>备注</Button>}{can("finance_view") && (!transactions || row.status !== "已对账") && row.updatedAt && Number.isSafeInteger(row.amount) && (transactions || (Number.isSafeInteger(row.amountWithoutTax) && Number.isSafeInteger(row.tax))) && <Button size="small" onClick={() => editFinance(row)}>编辑</Button>}</Space> },
    ]} />
    <Drawer title={transactions ? "资金流水详情" : kind === "receipts" ? "收到发票详情" : "开出发票详情"} open={!!selected} onClose={() => setSelected(null)} width={520} destroyOnHidden>
      {selected && <Descriptions column={1} bordered size="small" items={[
        { key: "date", label: "日期", children: date(selected.date) },
        { key: "project", label: "项目", children: selected.project },
        { key: "company", label: "公司", children: selected.company },
        ...(transactions ? [
          { key: "type", label: "类型", children: selected.type || "—" },
          { key: "direction", label: "方向", children: <StatusTag value={selected.direction === "income" ? "收入" : selected.direction === "outgoing" ? "支出" : selected.direction} /> },
          { key: "title", label: "摘要", children: selected.title || "—" },
        ] : [
          { key: "number", label: "发票号码", children: selected.number || "—" },
          { key: "ticketStatus", label: "发票状态", children: <StatusTag value={selected.ticketStatus} /> },
        ]),
        ...(transactions ? [
          { key: "name", label: "本方名称", children: selected.name || "—" },
          { key: "accountName", label: "收付款户名", children: selected.accountName || "—" },
          { key: "channel", label: "本方渠道", children: selected.channel || "—" },
          { key: "oppositeName", label: "对方名称", children: selected.oppositeName || "—" },
          { key: "oppositeAccountName", label: "对方户名", children: selected.oppositeAccountName || "—" },
          { key: "oppositeChannel", label: "对方渠道", children: selected.oppositeChannel || "—" },
        ] : [
          { key: "party", label: kind === "receipts" ? "开票方" : "购票方", children: selected.party || "—" },
          { key: "ticketClass", label: "发票种类", children: selected.ticketClass || "—" },
          ...(kind === "receipts" ? [{ key: "title", label: "名目", children: selected.title || "—" }] : []),
          { key: "index", label: "发票序号", children: selected.index ?? "—" },
          { key: "projectNumber", label: "工程编号", children: selected.projectNumber ?? "—" },
          { key: "taxRate", label: "税率", children: selected.taxRate || "—" },
          { key: "amountWithoutTax", label: "不含税金额", children: <Money value={selected.amountWithoutTax} /> },
          { key: "tax", label: "税额", children: <Money value={selected.tax} /> },
          ...(kind === "receipts" ? [{ key: "issueDate", label: "开票日期", children: date(selected.issueDate) }] : []),
          { key: "deductDate", label: "抵扣月份", children: date(selected.deductDate) },
          { key: "submitDate", label: "做账月份", children: date(selected.submitDate) },
          { key: "person", label: "交票人", children: selected.person || "—" },
          { key: "receiptType", label: "发票类型", children: selected.receiptType || "—" },
          ...(kind === "receipts" ? [{ key: "storagePlace", label: "存放位置", children: selected.storagePlace || "—" }] : []),
          { key: "purpose", label: "用途", children: selected.purpose || "—" },
          { key: "taxCode", label: "计税方式", children: selected.taxCode || "—" },
          { key: "tags", label: "标签", children: selected.tags || "—" },
        ]),
        { key: "note", label: "备注", children: selected.note || "—" },
        { key: "todo", label: "待办事项", children: selected.todo || "—" },
        { key: "amount", label: "金额", children: <Money value={selected.amount} /> },
        { key: "status", label: "对账状态", children: <StatusTag value={selected.status} /> },
        { key: "verifiedAt", label: "对账日期", children: date(selected.verifiedAt) },
        { key: "files", label: "附件", children: <AttachmentLinks files={selected.files} id={selected.id} kind={kind} /> },
      ]} />}
    </Drawer>
    <FormDrawer title="修改备注" open={!!noteRow} onCancel={() => setNoteRow(null)} confirmLoading={saving} onOk={async () => { try { setSaving(true); const response = await fetch("/api/finance/note", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: noteRow?.id, updatedAt: noteRow?.updatedAt, kind, note }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "保存失败"); message.success("备注已保存"); setNoteRow(null); resetLoading(); setRevision((value) => value + 1); } catch (e) { message.error(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); } }}><Input.TextArea aria-label="备注" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4} /></FormDrawer>
    <FormDrawer title={creating ? transactions ? "新增交易" : kind === "receipts" ? (cloning ? "复制收票" : "新增收票") : (cloning ? "复制开票" : "新增开票") : transactions ? "编辑交易明细" : "编辑发票"} open={creating || !!editing} onCancel={() => { setEditing(null); setCreating(false); }} onOk={saveTransaction} confirmLoading={saving}>
      <Form form={form} layout="vertical" preserve={false}>
        {cloning && creating && <Alert type="info" showIcon message="已复制基础信息，请填写新票号和金额。附件及对账信息不会复制。" style={{ marginBottom: 20 }} />}
        <><Form.Item name="projectId" label="项目" rules={creating ? [{ required: true, message: "请选择项目" }] : []}><Select disabled={!!projectId} showSearch filterOption={false} onSearch={(value) => searchOptions("projects", value)} options={projectId ? [{ value: projectId, label: projectName || "当前项目" }] : projects} placeholder="搜索项目" /></Form.Item><Form.Item name="companyId" label="公司" rules={creating ? [{ required: true, message: "请选择公司" }] : []}><Select showSearch filterOption={false} onSearch={(value) => searchOptions("companies", value)} options={companies} placeholder="搜索公司" /></Form.Item></>
        <Form.Item name="date" label={transactions ? "交易日期" : kind === "receipts" ? "日期" : "开票日期"} rules={creating || editing?.date ? [{ required: true }] : []}><StringDatePicker style={{ width: "100%" }} /></Form.Item>
        {!transactions && !creating && <><Form.Item name="index" label="发票序号"><InputNumber min={0} max={2147483647} precision={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="projectNumber" label="工程编号"><InputNumber min={0} max={2147483647} precision={0} style={{ width: "100%" }} /></Form.Item></>}
        {transactions ? <><Form.Item name="type" label="交易类型" rules={[{ required: creating || !!editing?.type, whitespace: true, max: 80 }]}><TransactionTypeInput /></Form.Item><Form.Item name="title" label="摘要"><Input maxLength={200} /></Form.Item><Form.Item name="amount" label="金额（元，支出填负数）" rules={[{ required: true, pattern: /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, message: "请输入最多两位小数的金额" }]}><Input inputMode="decimal" /></Form.Item></> : <><Form.Item name="number" label="发票号码" rules={[{ required: creating || !!editing?.number, whitespace: true, max: 100 }]}><Input maxLength={100} /></Form.Item><Form.Item name="party" label={kind === "receipts" ? "开票方" : "购买方"}><Input maxLength={200} /></Form.Item><Form.Item name="ticketClass" label="发票种类" normalize={(value) => value ?? ""}><AutoComplete allowClear options={["专票", "普票"].map(value => ({ value }))}><Input maxLength={100} /></AutoComplete></Form.Item><Form.Item name="ticketStatus" label="发票状态"><Select options={["未设置", "有效", "作废", "已抵扣", "未交票"].map((value) => ({ value, label: value }))} /></Form.Item>{([['amountWithoutTax', '不含税金额（元）'], ['tax', '税额（元）']] as const).map(([name, label]) => <Form.Item key={name} name={name} label={label} rules={[{ required: true, pattern: /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, message: "请输入最多两位小数的金额" }]}><Input inputMode="decimal" /></Form.Item>)}<p>含税金额将按不含税金额与税额相加计算。</p>{(kind === "receipts" ? ([['person', '交票人'], ['receiptType', '发票类型'], ['purpose', '发票用途'], ['title', '名目'], ['storagePlace', '存放位置']] as const) : ([['taxCode', '计税方式']] as const)).map(([name, label]) => <Form.Item key={name} name={name} label={label} normalize={(value) => value ?? ""}>{name === "receiptType" || name === "purpose" || name === "taxCode" ? <AutoComplete allowClear options={(name === "receiptType" ? ["工程票", "工资表", "预缴税"] : name === "purpose" ? ["劳务成本", "材料成本", "抵增值税"] : ["简易计税", "一般计税"]).map(value => ({ value }))}><Input maxLength={500} /></AutoComplete> : <Input maxLength={500} />}</Form.Item>)}{([['tags', '标签'], ['note', '备注'], ['todo', '待办']] as const).map(([name, label]) => <Form.Item key={name} name={name} label={label}><Input maxLength={500} /></Form.Item>)}{(kind === "receipts" ? ([['issueDate', '开票日期'], ['deductDate', '抵扣月份'], ['submitDate', '做账月份']] as const) : ([['deductDate', '抵扣月份'], ['submitDate', '做账月份']] as const)).map(([name, label]) => <Form.Item key={name} name={name} label={label}><StringDatePicker style={{ width: "100%" }} /></Form.Item>)}</>}
        {transactions && ([['name', '本方名称'], ['accountName', '收付款户名'], ['channel', '收付款渠道'], ['oppositeName', '对方名称'], ['oppositeAccountName', '对方户名'], ['oppositeChannel', '对方渠道'], ['note', '备注'], ['todo', '待办事项']] as const).map(([name, label]) => <Form.Item key={name} name={name} label={label}><Input maxLength={500} /></Form.Item>)}
        {!creating && <Form.Item name="verifiedAt" label="对账日期"><StringDatePicker style={{ width: "100%" }} /></Form.Item>}
        {!creating && <Form.Item name="status" label="对账状态" rules={[{ required: true }]}><Select options={[{ value: "未设置", label: "未设置" }, { value: "未对账", label: "未对账" }, { value: "已对账", label: "已对账" }]} /></Form.Item>}
      </Form>
    </FormDrawer>
  </Card></div>;
}

function AttachmentLinks({ files, id, kind, onUploaded, thumbnail, uploadField, projectVersion }: { files: Attachment[]; id: string; kind: string; onUploaded?: () => void; thumbnail?: boolean; uploadField?: string; projectVersion?: string | null }) {
  const { can, any } = useAccess();
  const canUpload = kind === "transactions" ? can("finance_view") : can("project_file_upload") && (kind === "files" ? can("file_view") : kind === "projects" ? can("project_file_view") : any("finance_view", "project_bill_view"));
  const [selected, setSelected] = useState<Attachment | null>(null);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const { message } = App.useApp();
  const params = selected ? new URLSearchParams({ kind, id, field: selected.field, index: String(selected.index) }) : null;
  const url = params ? `/api/attachments?${params}` : "";
  const upload = (field: string, label: React.ReactNode, replace = false) => <Upload multiple={kind === "files" || kind === "projects" || (kind === "receipts" && ["receipts", "otherFiles"].includes(field))} showUploadList={false} customRequest={({ file, onSuccess, onError }) => {
    const send = async () => {
    const data = new FormData(); data.set("id", id); data.set("kind", kind); data.set("field", field); data.set("file", file); if (replace) data.set("replace", "1");
    const filename = file instanceof File ? file.name : "文件";
    try { const response = await fetch("/api/attachments/upload", { method: "POST", body: data }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "上传失败"); message.success(kind === "files" ? `${filename} 上传成功` : "附件上传成功"); onSuccess?.(result); onUploaded?.(); }
    catch (error) { const failure = error instanceof Error ? error : new Error("上传失败"); message.error(kind === "files" ? `${filename}：${failure.message}` : failure.message); onError?.(failure); }
    };
    if (kind === "files" || kind === "projects" || (kind === "receipts" && ["receipts", "otherFiles"].includes(field))) uploadQueue.current = uploadQueue.current.then(send, send); else void send();
  }}>{label}</Upload>;
  const remove = async (file: Attachment) => { try { const response = await fetch(`/api/projects/${id}/attachments`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: file.field, index: file.index, updatedAt: projectVersion }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "删除失败"); message.success("附件已移除"); onUploaded?.(); } catch (error) { message.error(error instanceof Error ? error.message : "删除失败"); } };
  return <><Space size={4} wrap>{files.map((file) => thumbnail ? <button type="button" className="file-thumbnail" key={`${file.field}-${file.index}`} onClick={() => setSelected(file)} aria-label="预览图片"><AntImage preview={false} alt="" src={`/api/attachments?${new URLSearchParams({ kind, id, field: file.field, index: String(file.index) })}`} /></button> : <Space key={`${file.field}-${file.index}`} size={4}><Button size="small" icon={<FileTextOutlined />} className="attachment-action" onClick={() => setSelected(file)}>{file.label}</Button>{kind === "projects" && projectVersion && can("project_file_delete") && <Popconfirm title="移除这个附件？" description="移除项目关联，存储中的原文件保留。" onConfirm={() => remove(file)}><Button size="small" danger>删除</Button></Popconfirm>}</Space>)}
      {kind === "receipts" && <TransferRecords receiptId={id} onChanged={onUploaded} />}
      {onUploaded && canUpload && kind === "receipts" ? <Dropdown trigger={["click"]} menu={{ items: ([['receipts', '发票'], ['otherFiles', '其他资料'], ['contract', '合同'], ['license', '营业执照'], ['ownerId', '法人身份证'], ['bankCertificate', '开户许可证']] as const).map(([field, label]) => { const replace = !['receipts', 'otherFiles'].includes(field) && files.some((file) => file.field === field); return { key: field, label: upload(field, `${replace ? '更换' : '上传'}${label}`, replace) }; }) }}><Button size="small" className="attachment-action" icon={<UploadOutlined />}>上传</Button></Dropdown> : onUploaded && canUpload && (kind === "projects" || kind === "files" || kind === "transactions") ? upload(kind === "transactions" ? "receipt" : uploadField || "otherFiles", <Button size={kind === "files" ? "middle" : "small"} className="attachment-action" icon={<UploadOutlined />}>{kind === "transactions" && files.length ? "更换" : "上传"}</Button>, kind === "transactions" && files.length > 0) : null}
      {!files.length && !onUploaded && "—"}</Space>
    <Drawer title={selected?.label || "附件预览"} width={720} className="attachment-drawer" open={!!selected} onClose={() => setSelected(null)} extra={selected && <Button icon={<DownloadOutlined />} href={`${url}&download=1`} target="_blank" rel="noopener noreferrer">下载</Button>} destroyOnHidden>
      {selected && (selected.extension && ["png", "jpg", "jpeg", "webp", "gif"].includes(selected.extension) ? <div className="attachment-image-preview"><AntImage src={url} alt={selected.label} preview={false} /></div> : selected.extension !== "pdf" ? <div style={{ padding: 24 }}>该文件可下载后查看。</div> : <iframe className="attachment-preview" title={`${selected.label}预览`} src={url} referrerPolicy="no-referrer" />)}
    </Drawer></>;
}

function ProjectDetail({ selected, onUpdated }: { selected: Project; onUpdated: () => void }) {
  const { can } = useAccess();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); readJSON<Detail>(`/api/projects/${selected.id}`, controller.signal).then((result) => { setData(result); setError(""); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [selected.id, revision]);
  return <div className="dashboard">{error ? <Alert type="error" showIcon message={error} /> : <Card variant="borderless" className="panel" loading={!data} title={data?.project.name || selected.name}>
    {data && <>
    <Tabs activeKey={activeTab} onChange={setActiveTab} items={[{ key: "info", label: "项目信息", children: <><div className="table-actions"><ProjectEdit id={selected.id} project={data.project} onSaved={() => { setRevision((n) => n + 1); onUpdated(); }} /></div><Descriptions className="project-info" size="small" bordered column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }} items={[
      { key: "number", label: "项目编号", children: data.project.number ?? "—" }, { key: "status", label: "项目状态", children: <StatusTag value={data.project.status} /> }, { key: "address", label: "工程地址", children: data.project.address || "—" }, { key: "bidders", label: "投标人", children: data.project.bidders.join("、") || "—" }, { key: "phone", label: "联系方式", children: data.project.phone || "—" }, { key: "method", label: "投标方式", children: data.project.bidMethod || "—" }, { key: "bidStatus", label: "中标状态", children: <StatusTag value={data.project.bidStatus} /> }, { key: "bidAddress", label: "开标地点", children: data.project.bidAddress || "—" }, { key: "bidTime", label: "开标时间", children: dateTime(data.project.bidStartTime) }, { key: "limit", label: "最高限价", children: <Money value={data.project.bidLimit} unit="yuan" /> }, { key: "original", label: "原件要求", children: data.project.requireOriginalFiles == null ? "—" : data.project.requireOriginalFiles ? "是" : "否" }, { key: "bids", label: "报价", children: data.project.bids.join("、") || "—" }, { key: "caller", label: "招标单位", children: data.project.caller || "—" }, { key: "winner", label: "中标公司", children: typeof data.project.winner === "string" ? data.project.winner || "—" : data.project.winner?.label || data.project.winner?.name || "—" }, { key: "price", label: "中标金额", children: <Money value={data.project.winnerPrice} unit="yuan" /> }, { key: "type", label: "项目类型", children: data.project.projectType || "—" }, { key: "tags", label: "标签", children: data.project.tags.join("、") || "—" }, { key: "description", label: "项目描述", span: "filled", children: data.project.description || "—" }, { key: "notes", label: "备注", span: "filled", children: data.project.notes || "—" }, { key: "created", label: "创建时间", children: dateTime(data.project.createdAt) }, { key: "updated", label: "最近更新", children: date(data.project.updatedAt) }, { key: "editor", label: "编辑人", children: data.project.lastEditedBy || "—" }, { key: "callerContact", label: "招标联系人", children: data.project.callerContact || "—" }, { key: "callerPhone", label: "招标联系方式", children: data.project.callerPhone || "—" }, { key: "callerBank", label: "招标开户行", children: data.project.callerBank || "—" }, { key: "callerAccount", label: "招标银行账户", children: data.project.callerBankAccount || "—" }, { key: "winnerOther", label: "其他中标公司", children: data.project.winnerOther || "—" }, { key: "managementFee", label: "管理费", children: data.project.managementFee == null ? "—" : `${data.project.managementFee}%` }, { key: "tax", label: "税费", children: data.project.tax == null ? "—" : `${data.project.tax}%` }, { key: "taxRatio", label: "抵增税比", children: data.project.taxDeductRatio || "—" }, { key: "materialRatio", label: "材料票比", children: data.project.materialRatio || "—" }, { key: "laborRatio", label: "劳务票比", children: data.project.laborRatio || "—" }, { key: "period", label: "工期", children: `${date(data.project.projectStart)} - ${date(data.project.projectEnd)}` }, { key: "todo", label: "待办", span: "filled", children: data.project.todo || "—" },
    ]} /></> }, { key: "companies", label: "投标公司", children: <ProjectCompanies id={selected.id} version={data.project.updatedAt} companies={data.project.bidderCompanies} onSaved={() => { setRevision((n) => n + 1); onUpdated(); }} /> }, ...(can("finance_view") ? [{ key: "transactions", label: "交易明细", children: <Finance transactions initialKind="transactions" projectId={selected.id} projectName={data.project.name} /> }, { key: "transaction-summary", label: "交易概览", children: <FinanceSummary transactions projectId={selected.id} /> }, ] : []), ...(data.permissions.bills ? [{ key: "receipts", label: "工程收票", children: <Finance transactions={false} initialKind="receipts" projectId={selected.id} projectName={data.project.name} /> }, { key: "invoices", label: "工程开票", children: <Finance transactions={false} initialKind="invoices" projectId={selected.id} projectName={data.project.name} /> }, { key: "ticket-summary", label: "发票概览", children: <InvoiceSummary projectId={selected.id} /> }, ] : []), ...(data.permissions.files ? [{ key: "files", label: "文件管理", children: <Space direction="vertical" size="middle" style={{ width: "100%" }}>{([['callerFiles', '招标文件'], ['bidderFiles', '投标文件'], ['winnerNotifications', '中标通知书'], ['constructionContracts', '施工合同'], ['jobContracts', '劳务合同'], ['completeVerifications', '竣工验收资料'], ['otherFiles', '其他资料']] as const).map(([field, label]) => <div key={field}><strong>{label}：</strong><AttachmentLinks files={data.project.files.filter((file) => file.field === field)} id={selected.id} kind="projects" uploadField={field} projectVersion={data.project.updatedAt} onUploaded={() => setRevision((n) => n + 1)} /></div>)}</Space> }] : [])]} />
    </>}
  </Card>}</div>;
}

type ManagedFile = EditableFile & { createdAt: string | null; files: Attachment[] };
type FileFilters = { q: string; type: string; subtype: string; status: string; needRenew: string; owner: string; associates: string[]; tags: string[] };
const emptyFileFilters = (): FileFilters => ({ q: "", type: "", subtype: "", status: "", needRenew: "", owner: "", associates: [], tags: [] });
function FilesPage() {
  const { can, any } = useAccess();
  const [draft, setDraft] = useState(emptyFileFilters);
  const [filters, setFilters] = useState(emptyFileFilters);
  const [categories, setCategories] = useState<{ id: string; name: string; subCategories: string[] }[]>([]);
  const [filterCategories, setFilterCategories] = useState<{ name: string; deleted: boolean; subCategories: { name: string; deleted: boolean }[] }[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [filePeople, setFilePeople] = useState<Record<string, string>>({});
  const peopleRequest = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<{ field: string; order: "asc" | "desc" }>({ field: "createdAt", order: "desc" });
  const [data, setData] = useState<{ total: number; items: ManagedFile[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const refresh = () => { setLoading(true); setError(""); setRevision((n) => n + 1); };
  const refreshAfterChange = () => { refresh(); setOptionsRevision((n) => n + 1); };
  const search = () => { setPage(1); setFilters({ ...draft, q: draft.q.trim() }); refresh(); };
  const change = (values: Partial<FileFilters>) => setDraft((old) => ({ ...old, ...values }));
  const findPeople = async (q = "") => { const current = ++peopleRequest.current; try { const result = await readJSON<{ items: { value: string; label: string }[] }>(`/api/files/options?${new URLSearchParams({ people: q })}`); if (current === peopleRequest.current) setPeople(result.items); } catch (e) { if (current === peopleRequest.current) setError(e instanceof Error ? e.message : "无法读取关联选项"); } };
  useEffect(() => { const controller = new AbortController(); readJSON<{ categories: { id: string; name: string; subCategories: string[] }[]; filterCategories: { name: string; deleted: boolean; subCategories: { name: string; deleted: boolean }[] }[]; tags: string[] }>("/api/files/options", controller.signal).then((result) => { setCategories(result.categories); setFilterCategories(result.filterCategories); setTags(result.tags); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [optionsRevision]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sort: sorting.field, order: sorting.order, q: filters.q, type: filters.type, subtype: filters.subtype, status: filters.status, needRenew: filters.needRenew, owner: filters.owner });
    filters.associates.forEach((value) => params.append("associate", value)); filters.tags.forEach((value) => params.append("tag", value));
    readJSON<{ total: number; items: ManagedFile[] }>(`/api/files?${params}`, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, sorting, filters, revision]);
  useEffect(() => {
    const ids = [...new Set((data?.items || []).flatMap(row => [row.owner, ...row.associates]).filter(value => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)))];
    if (!ids.length) return;
    const controller = new AbortController();
    const batches = Array.from({ length: Math.ceil(ids.length / 60) }, (_, index) => ids.slice(index * 60, index * 60 + 60));
    Promise.all(batches.map(batch => readJSON<{ items: { value: string; label: string }[] }>(`/api/files/options?${new URLSearchParams({ ids: batch.join(",") })}`, controller.signal))).then(results => setFilePeople(Object.fromEntries(results.flatMap(result => result.items).map(item => [item.value.toLowerCase(), item.label])))).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [data]);
  return <div className="dashboard"><Card variant="borderless" className="panel filter-panel"><div className="toolbar">
    <div className="filter-field"><label htmlFor="file-search">文件名</label><Input id="file-search" placeholder="搜索文件名" prefix={<SearchOutlined />} value={draft.q} onChange={(e) => change({ q: e.target.value })} onPressEnter={search} allowClear /></div>
    <div className="filter-field"><label htmlFor="file-type">分类</label><Select id="file-type" onFocus={() => setOptionsRevision((n) => n + 1)} value={draft.type} onChange={(value) => change({ type: value, subtype: "" })} options={[{ value: "", label: "全部分类" }, ...filterCategories.map((c) => ({ value: c.name, label: c.deleted ? `${c.name}（历史）` : c.name }))]} /></div>
    <div className="filter-field"><label htmlFor="file-subtype">子分类</label><Select id="file-subtype" onFocus={() => setOptionsRevision((n) => n + 1)} value={draft.subtype} onChange={(value) => change({ subtype: value })} options={[{ value: "", label: "全部子分类" }, ...(filterCategories.find((c) => c.name === draft.type)?.subCategories || []).map((item) => ({ value: item.name, label: item.deleted ? `${item.name}（历史）` : item.name }))]} /></div>
    <div className="filter-field"><label htmlFor="file-owner">归属</label><Select id="file-owner" showSearch filterOption={false} allowClear placeholder="搜索人员或公司" value={draft.owner || undefined} onFocus={() => findPeople()} onSearch={findPeople} onChange={(value) => change({ owner: value || "" })} options={people} /></div>
    <div className="filter-field"><label htmlFor="file-associates">关联</label><Select id="file-associates" mode="multiple" showSearch filterOption={false} placeholder="搜索人员或公司" value={draft.associates} onFocus={() => findPeople()} onSearch={findPeople} onChange={(value) => change({ associates: value })} options={people} /></div>
    <div className="filter-field"><label htmlFor="file-tags">标签</label><Select id="file-tags" onFocus={() => setOptionsRevision((n) => n + 1)} mode="multiple" placeholder="全部标签" value={draft.tags} onChange={(value) => change({ tags: value })} options={tags.map((value) => ({ value, label: value }))} /></div>
    <div className="filter-field"><label htmlFor="file-renew">年审</label><Select id="file-renew" value={draft.needRenew} onChange={(value) => change({ needRenew: value })} options={[{ value: "", label: "全部" }, { value: "true", label: "需要" }, { value: "false", label: "不需要" }]} /></div>
    <div className="filter-field"><label htmlFor="file-status">状态</label><Select id="file-status" value={draft.status} onChange={(value) => change({ status: value })} options={[{ value: "", label: "全部状态" }, ...["有效", "过期", "永久", "存稿"].map((value) => ({ value, label: value }))]} /></div>
    <Space><Button type="primary" onClick={search}>查询</Button><Button onClick={() => { setDraft(emptyFileFilters()); setFilters(emptyFileFilters()); setPage(1); refresh(); }}>重置</Button><AttachmentLinks files={[]} id="" kind="files" onUploaded={refreshAfterChange} /><FileCategories categories={categories} onChanged={refreshAfterChange} /></Space></div></Card>
    <Card variant="borderless" className="panel project-panel">{error && <Alert className="error" type="error" showIcon message={error} />}
      <Table<ManagedFile> rowKey="id" loading={loading} dataSource={data?.items || []} scroll={{ x: 1970 }} pagination={{ current: page, total: data?.total || 0, pageSize, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200, 300, 400], showTotal: (total) => `共 ${total} 条`, onChange: (value, size) => { setLoading(true); setPage(size !== pageSize ? 1 : value); setPageSize(size); } }} onChange={(_pagination, _filters, sorter, extra) => { if (extra.action !== "sort") return; const active = Array.isArray(sorter) ? sorter[0] : sorter; setPage(1); setLoading(true); setSorting(active.order ? { field: String(active.field), order: active.order === "ascend" ? "asc" : "desc" } : { field: "createdAt", order: "desc" }); }} columns={[{ title: "文件名称", dataIndex: "filename", width: 300 }, { title: "分类", dataIndex: "type", width: 120, render: (value: string) => value || "—" }, { title: "子分类", dataIndex: "subtype", width: 120, render: (value: string) => value || "—" }, { title: "归属", dataIndex: "owner", width: 140, render: (value: string) => value ? filePeople[value.toLowerCase()] || value : "—" }, { title: "关联", dataIndex: "associates", width: 180, render: (values: string[]) => values.map(value => filePeople[value.toLowerCase()] || value).join("、") || "—" }, { title: "标签", dataIndex: "tags", width: 160, render: (values: string[]) => values.join("、") || "—" }, { title: "备注", dataIndex: "note", width: 180, render: (value: string) => value || "—" }, { title: "生效日期", dataIndex: "effectiveFrom", width: 130, sorter: true, sortOrder: sorting.field === "effectiveFrom" ? sorting.order === "asc" ? "ascend" : "descend" : null, render: date }, { title: "到期日期", dataIndex: "expiresAt", width: 130, sorter: true, sortOrder: sorting.field === "expiresAt" ? sorting.order === "asc" ? "ascend" : "descend" : null, render: date }, { title: "年审", dataIndex: "needRenew", width: 100, render: (value: boolean | null) => value === true ? "需要" : value === false ? "不需要" : "—" }, { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <StatusTag value={value || "—"} /> }, { title: "创建日期", dataIndex: "createdAt", width: 120, render: date }, { title: "附件", dataIndex: "files", width: 120, fixed: "right", render: (files: Attachment[], row) => <AttachmentLinks files={files} id={row.id} kind="files" thumbnail={files.some((file) => ["png", "jpg", "jpeg", "webp", "gif"].includes(file.extension || ""))} /> }, ...(any("project_file_upload", "project_file_delete") ? [{ title: "操作", width: can("project_file_upload", "project_file_delete") ? 150 : 88, fixed: "right" as const, render: (_: unknown, row: ManagedFile) => <FileEditor file={row} categories={categories} tags={tags} onChanged={refreshAfterChange} /> }] : [])]} />
    </Card></div>;
}

type Staff = { id: number; name: string; position: string; company: string; status: string; entryDate: string | null; username: string; phone?: string; salary?: number | null; percentage?: number | null; insurePay?: string | null };
function StaffPage() {
  const { can, any } = useAccess();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [insuranceInput, setInsuranceInput] = useState("");
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const staffOriginal = useRef<Record<string, unknown> | null>(null);
  const [filters, setFilters] = useState({ insurance: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<{ total: number; items: Staff[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = () => { setLoading(true); setError(""); setRevision((n) => n + 1); };
  const search = () => { setPage(1); setQuery(input.trim()); setStatus(statusInput); setFilters({ insurance: insuranceInput, from: range?.[0]?.format("YYYY-MM-DD") || "", to: range?.[1]?.format("YYYY-MM-DD") || "" }); refresh(); };
  useEffect(() => {
    const controller = new AbortController();
    readJSON<{ total: number; items: Staff[] }>(`/api/staff?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: query, status, ...filters })}`, controller.signal).then(setData).catch((e) => { if (e.name !== "AbortError") { setData(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, query, status, filters, revision]);
  const statuses: Record<string, string> = { ON: "在职", OFF: "离职", "ON-TRY": "试用", "ON-HALF": "兼职" };
  const openStaff = async (row?: Staff) => {
    form.resetFields();
    if (!row) { form.setFieldsValue({ staff_status: "ON", salary: 0, percentage: 0 }); setEditing("new"); return; }
    try { const values = await readJSON<Record<string, unknown>>(`/api/staff/write?id=${row.id}`); staffOriginal.current = values; form.setFieldsValue(values); setEditing(row.id); } catch (e) { message.error(e instanceof Error ? e.message : "无法读取人员信息"); }
  };
  const saveStaff = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { salary, percentage, ...basicValues } = values;
      const response = await fetch("/api/staff/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...basicValues, position: values.position || "", ...(editing === "new" ? { salary, percentage } : { id: editing, expected: staffOriginal.current, ...(can("salarydetail_view", "salarydetail_change") && form.isFieldsTouched(["salary", "percentage"]) ? { salary: salary ?? null, percentage: percentage ?? null } : {}) }) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      message.success("人员信息已保存"); setEditing(null); refresh();
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  return <div className="dashboard"><Card variant="borderless" className="panel filter-panel"><div className="toolbar"><div className="filter-field"><label htmlFor="staff-search">姓名</label><Input id="staff-search" placeholder="搜索人员姓名" prefix={<SearchOutlined />} value={input} onChange={(e) => setInput(e.target.value)} onPressEnter={search} allowClear /></div><div className="filter-field"><label htmlFor="staff-status">人员状态</label><Select id="staff-status" aria-label="人员状态" value={statusInput} onChange={setStatusInput} options={[{ value: "", label: "全部状态" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label })), { value: "__unset__", label: "未设置" }]} /></div><div className="filter-field"><span>入职时间</span><DatePicker.RangePicker aria-label="入职时间" allowEmpty={[true, true]} value={range} onChange={setRange} /></div>{can("insurancedetail_view") && <div className="filter-field"><label htmlFor="staff-insurance">社保缴纳</label><Select id="staff-insurance" value={insuranceInput} onChange={setInsuranceInput} options={[{ value: "", label: "全部方式" }, { value: "NULL", label: "个人全缴" }, { value: "FULL", label: "公司全缴" }, { value: "HALF", label: "公司部分缴纳" }, { value: "HALF-D", label: "公司代扣代缴" }, { value: "__unset__", label: "未设置" }]} /></div>}<Space><Button type="primary" onClick={search}>查询</Button><Button onClick={() => { setInput(""); setQuery(""); setStatus(""); setStatusInput(""); setInsuranceInput(""); setRange(null); setFilters({ insurance: "", from: "", to: "" }); setPage(1); refresh(); }}>重置</Button></Space></div></Card>
    <Card variant="borderless" className="panel project-panel">{can("staff_add") && <Space className="table-actions"><Button type="primary" onClick={() => openStaff()}>新增人员</Button></Space>}{error && <Alert className="error" type="error" showIcon message={error} />}
      <Table<Staff> rowKey="id" loading={loading} dataSource={data?.items || []} scroll={{ x: "max-content" }} pagination={{ current: page, total: data?.total || 0, pageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 条`, onChange: (value, size) => { setLoading(true); setPage(size !== pageSize ? 1 : value); setPageSize(size); } }} columns={[{ title: "员工编号", dataIndex: "id", width: 110 }, { title: "姓名", dataIndex: "name", width: 140 }, ...(can("staff_staff") ? [{ title: "联系方式", dataIndex: "phone", width: 150, render: (value: string) => value || "—" }] : []), { title: "职位", dataIndex: "position", width: 160, render: (value: string) => value || "—" }, { title: "所属公司", dataIndex: "company", width: 200, render: (value: string) => value || "—" }, { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <StatusTag value={statuses[value] || value} /> }, { title: "入职日期", dataIndex: "entryDate", width: 145, className: "nowrap-cell", render: (value: string) => value || "—" }, ...(can("insurancedetail_view") ? [{ title: "社保缴纳", dataIndex: "insurePay", width: 140, render: (value: string) => ({ FULL: "公司全缴", NULL: "个人全缴", HALF: "公司部分缴纳", "HALF-D": "公司代扣代缴" } as Record<string, string>)[value] || "—" }] : []), ...(can("salarydetail_view") ? [{ title: "固定工资", dataIndex: "salary", width: 130, render: (value: number | null) => <Money value={value} unit="yuan" /> }, { title: "资料费提成", dataIndex: "percentage", width: 130, render: (value: number | null) => value == null ? "—" : `${value}%` }] : []), { title: "登录账号", dataIndex: "username", width: 150, render: (value: string) => value || "—" }, ...(any("staff_staff", "staff_item", "staff_insurancedetail", "staff_salarydetail", "certificate_view", "exam_view") ? [{ title: "操作", fixed: "right" as const, width: 32 + (can("staff_staff") ? 55 : 0) + (any("staff_staff", "staff_item") ? 55 : 0) + (can("staff_insurancedetail") ? 84 : 0) + (can("staff_salarydetail") || can("staff_insurancedetail") ? 84 : 0) + (can("certificate_view") || can("exam_view") ? 104 : 0), render: (_: unknown, row: Staff) => <Space size={4}>{can("staff_staff") && <Button size="small" onClick={() => openStaff(row)}>编辑</Button>}{any("staff_staff", "staff_item") && <StaffAssets staff={row.id} name={row.name} />}{can("staff_insurancedetail") && <StaffInsurance id={row.id} name={row.name} onUpdated={refresh} />}{(can("staff_salarydetail") || can("staff_insurancedetail")) && <StaffHistory id={row.id} name={row.name} />}{(can("certificate_view") || can("exam_view")) && <StaffRecords id={row.id} name={row.name} />}</Space> }] : [])]} />
      <FormDrawer title={editing === "new" ? "新增人员" : "编辑人员"} open={editing !== null} onCancel={() => setEditing(null)} onOk={saveStaff} confirmLoading={saving}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, max: 15 }]}><Input maxLength={15} /></Form.Item>
          <Form.Item name="phone" label="联系方式" rules={editing === "new" ? [{ required: true, whitespace: true, max: 20 }] : [{ max: 20 }]}><Input maxLength={20} /></Form.Item>
          <Form.Item name="position" label="职位"><Input maxLength={15} /></Form.Item>
          <Form.Item name="entrydate" label="入职日期" rules={editing === "new" ? [{ required: true }] : undefined}><StringDatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="staff_status" label="状态" rules={editing === "new" ? [{ required: true }] : undefined}><Select allowClear={editing !== "new"} options={Object.entries(statuses).map(([value, label]) => ({ value, label }))} /></Form.Item>
          {(editing === "new" || can("salarydetail_view", "salarydetail_change")) && <><Form.Item name="salary" label="基本工资（元）" rules={editing === "new" ? [{ required: true }] : undefined}><InputNumber min={0} max={10000000} precision={2} /></Form.Item><Form.Item name="percentage" label="资料费提成比例（%）" rules={editing === "new" ? [{ required: true }] : undefined}><InputNumber min={0} max={100} precision={0} /></Form.Item></>}
        </Form>
      </FormDrawer>
    </Card></div>;
}

type PermissionNode = { id: number; label: string; flag: boolean; children: PermissionNode[] };
type Group = { id: number; name: string; usersCount: number; members: string[]; permissions: PermissionNode[]; permissionIds: number[] };
function AccountManagement({ initial }: { initial: string }) {
  const { can } = useAccess();
  const items = [...(can("user_view") ? [{ key: "users", label: "账号列表", children: <Users /> }] : []), ...(can("group_view") ? [{ key: "groups", label: "角色列表", children: <Groups /> }] : [])];
  return <Tabs defaultActiveKey={items.some((item) => item.key === initial) ? initial : items[0]?.key} items={items} />;
}
function Groups() {
  const { canManageRoles } = useAccess();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [catalog, setCatalog] = useState<PermissionNode[]>([]);
  const [checked, setChecked] = useState<React.Key[]>([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    readJSON<{ groups: Group[] }>("/api/groups", controller.signal).then((body) => setGroups(body.groups)).catch((e) => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const nodes = (list: PermissionNode[]): DataNode[] => list.map((item) => ({ key: String(item.id), title: <Space>{item.label}<StatusTag value={item.flag ? "已授权" : "未授权"} /></Space>, children: nodes(item.children || []) }));
  const editNodes = (list: PermissionNode[]): DataNode[] => list.map((item) => ({ key: String(item.id), title: item.label, children: editNodes(item.children || []) }));
  const edit = async (group?: Group) => {
    try {
      const result = await readJSON<{ permissions: PermissionNode[] }>("/api/groups?catalog=1");
      const visible = new Set<string>();
      const visit = (list: PermissionNode[]) => list.forEach((item) => { visible.add(String(item.id)); visit(item.children || []); });
      visit(result.permissions);
      setCatalog(result.permissions); setChecked((group?.permissionIds || []).map(String).filter((id) => visible.has(id))); form.setFieldsValue({ name: group?.name || "" }); setEditing(group || "new");
    } catch (e) { message.error(e instanceof Error ? e.message : "无法读取权限目录"); }
  };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.name, permissions: checked.map(Number), ...(editing !== "new" && editing ? { id: editing.id, expectedName: editing.name, expectedPermissions: editing.permissionIds } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "保存失败");
      message.success("角色已保存"); setEditing(null); setRevision((n) => n + 1);
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  const remove = async (group: Group) => { try { const response = await fetch(`/api/account-delete?kind=group&id=${group.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "删除失败"); message.success("角色已删除"); setRevision((n) => n + 1); } catch (e) { message.error(e instanceof Error ? e.message : "删除失败"); } };
  return <div className="dashboard"><Card variant="borderless" className="panel project-panel">{error && <Alert className="error" type="error" showIcon message={error} />}
    {canManageRoles && <div className="table-actions"><Button type="primary" onClick={() => edit()}>新增角色</Button></div>}
    <Table<Group> rowKey="id" loading={loading} dataSource={groups} pagination={false} scroll={{ x: 700 }} columns={[{ title: "角色名称", dataIndex: "name", width: 160 }, { title: "用户数", dataIndex: "usersCount", width: 100 }, { title: "人员", dataIndex: "members", render: (members: string[]) => members?.length ? members.join("、") : "—" }, { title: "操作", width: canManageRoles ? 220 : 110, fixed: "right", render: (_, row) => <Space size={4}><Button size="small" onClick={() => setSelected(row)}>查看权限</Button>{canManageRoles && <><Button size="small" onClick={() => edit(row)}>编辑</Button><Popconfirm title="确定删除该角色？" description="有账号使用的角色不能删除。" onConfirm={() => remove(row)}><Button size="small" danger>删除</Button></Popconfirm></>}</Space> }]} />
    <Drawer title={selected ? `${selected.name}的权限` : "角色权限"} width={600} className="attachment-drawer" open={!!selected} onClose={() => setSelected(null)} destroyOnHidden>{selected && <Tree treeData={nodes(selected.permissions || [])} defaultExpandAll selectable={false} />}</Drawer>
    <FormDrawer title={editing === "new" ? "新增角色" : "编辑角色"} open={!!editing} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving}><Form form={form} layout="vertical" preserve={false}><Form.Item name="name" label="角色名称" rules={[{ required: true, whitespace: true, max: 150 }]}><Input maxLength={150} /></Form.Item></Form><p>选择权限</p><Tree checkable checkStrictly checkedKeys={checked} onCheck={(keys) => setChecked(Array.isArray(keys) ? keys : keys.checked)} treeData={editNodes(catalog)} defaultExpandAll selectable={false} /></FormDrawer>
  </Card></div>;
}

function Users() {
  const { administrator } = useAccess();
  type User = { id: number; username: string; name: string; active: boolean; groups: string[]; date: string; lastLogin: string | null; password?: string };
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [selected, setSelected] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [roleChanged, setRoleChanged] = useState(false);
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    readJSON<{ users: User[] }>("/api/users", controller.signal).then((body) => setUsers(body.users)).catch((e) => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const { confirmPassword: _confirmPassword, password, groupId, ...rest } = values;
      void _confirmPassword;
      const response = await fetch("/api/users", { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rest, ...(password ? { password } : {}), ...(creating || roleChanged ? { groupId: groupId || null } : {}), ...(!creating ? { id: selected?.id, expectedGroups: selected?.groups, expectedUsername: selected?.username, expectedActive: selected?.active } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      message.success("账号已保存"); setSelected(null); setCreating(false); setRevision((n) => n + 1);
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  const edit = async (row: User) => {
    try {
      const result = await readJSON<{ groups: Group[] }>("/api/groups");
      setGroups(result.groups);
      form.resetFields(); form.setFieldsValue({ username: row.username, active: row.active, groupId: result.groups.find((group) => group.name === row.groups[0])?.id || null });
      setRoleChanged(false); setSelected(row);
    } catch (e) { message.error(e instanceof Error ? e.message : "无法读取角色列表"); }
  };
  const searchStaff = async (q: string) => {
    try { const result = await readJSON<{ staff: { id: number; name: string }[] }>(`/api/users?staff=${encodeURIComponent(q)}`); setStaff(result.staff); }
    catch (e) { message.error(e instanceof Error ? e.message : "无法读取人员列表"); }
  };
  const create = async () => {
    try {
      const [roles, people] = await Promise.all([readJSON<{ groups: Group[] }>("/api/groups"), readJSON<{ staff: { id: number; name: string }[] }>("/api/users?staff=")]);
      setGroups(roles.groups); setStaff(people.staff); form.resetFields(); form.setFieldsValue({ active: true }); setRoleChanged(false); setCreating(true);
    } catch (e) { message.error(e instanceof Error ? e.message : "无法读取账号资料"); }
  };
  const filtered = users.filter((user) => (!appliedSearch || `${user.username} ${user.name} ${user.groups.join(" ")}`.toLocaleLowerCase().includes(appliedSearch.toLocaleLowerCase())) && (appliedStatus === "all" || user.active === (appliedStatus === "active")));
  const applyFilters = () => { setAppliedSearch(search.trim()); setAppliedStatus(status); };
  return <div className="dashboard"><Card variant="borderless" className="panel filter-panel"><div className="toolbar"><div className="filter-field"><label htmlFor="user-search">账号或姓名</label><Input id="user-search" allowClear placeholder="搜索账号、姓名或角色" value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={applyFilters} /></div><div className="filter-field"><label htmlFor="user-status">状态</label><Select id="user-status" value={status} onChange={setStatus} options={[{ value: "all", label: "全部状态" }, { value: "active", label: "启用" }, { value: "inactive", label: "停用" }]} /></div><Space><Button type="primary" onClick={applyFilters}>查询</Button><Button onClick={() => { setSearch(""); setStatus("all"); setAppliedSearch(""); setAppliedStatus("all"); }}>重置</Button></Space></div></Card><Card variant="borderless" className="panel project-panel">
    {error && <Alert className="error" type="error" showIcon message={error} />}
    {administrator && <div className="table-actions"><Button type="primary" onClick={create}>新增账号</Button></div>}
    <Table<User> rowKey="id" loading={loading} dataSource={filtered} scroll={{ x: 700 }} columns={[{ title: "账号", dataIndex: "username" }, { title: "姓名", dataIndex: "name", render: (value: string) => value || "—" }, { title: "密码", dataIndex: "password", render: (value: string | undefined) => value === undefined ? <span aria-label="密码已隐藏">••••••••</span> : value || "—" }, { title: "角色", dataIndex: "groups", render: (value: string[]) => value.join("、") || "—" }, { title: "状态", dataIndex: "active", render: (value: boolean) => <StatusTag value={value ? "启用" : "停用"} /> }, { title: "创建日期", dataIndex: "date" }, { title: "最近登录", dataIndex: "lastLogin", render: (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "暂无记录" }, { title: "操作", width: 80, fixed: "right", render: (_, row) => administrator ? <Button size="small" onClick={() => edit(row)}>编辑</Button> : null }]} />
    <FormDrawer title={creating ? "新增账号" : "编辑账号"} open={creating || !!selected} onCancel={() => { setSelected(null); setCreating(false); }} onOk={save} confirmLoading={saving}><Form form={form} layout="vertical" preserve={false}><Form.Item name="username" label="账号" rules={[{ required: true, pattern: /^[\w.@+-]{1,30}$/, message: "请输入 1–30 位字母、数字或 . @ + - _" }]}><Input maxLength={30} /></Form.Item>{creating && <Form.Item name="staffId" label="绑定人员" rules={[{ required: true, message: "请选择人员" }]}><Select showSearch filterOption={false} onSearch={searchStaff} placeholder="搜索尚未绑定账号的人员" options={staff.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>}<Form.Item name="password" label={creating ? "密码" : "新密码"} rules={[{ required: creating, min: 8, max: 30, message: "密码需要 8–30 位" }]}><Input.Password autoComplete="new-password" placeholder={creating ? "设置密码" : "留空则不修改密码"} maxLength={30} /></Form.Item><Form.Item name="confirmPassword" label="确认密码" dependencies={["password"]} rules={[({ getFieldValue }) => ({ validator(_, value) { return (!getFieldValue("password") && !value) || value === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}><Input.Password autoComplete="new-password" maxLength={30} /></Form.Item><Form.Item name="groupId" label="角色"><Select allowClear onChange={() => setRoleChanged(true)} placeholder="未分配角色" options={groups.map((group) => ({ value: group.id, label: group.name }))} /></Form.Item>{selected && selected.groups.length > 1 && <Alert type="warning" showIcon message="该账号有多个角色；修改角色时将只保留新选择的角色。" />}<Form.Item name="active" label="启用账号" valuePropName="checked"><Switch /></Form.Item></Form></FormDrawer>
  </Card></div>;
}
