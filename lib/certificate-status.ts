export const certificateStatuses = [
  { value: "ON", label: "已年审" },
  { value: "OFF", label: "待年审" },
  { value: "ON_HALF", label: "未过期" },
  { value: "OFF_HALF", label: "已过期" },
] as const;

export const certificateStatusLabel = (value: string | null) => certificateStatuses.find((item) => item.value === value)?.label || "";
export const isCertificateStatus = (value: unknown) => certificateStatuses.some((item) => item.value === value);
