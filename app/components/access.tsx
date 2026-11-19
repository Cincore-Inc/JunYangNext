"use client";
import { createContext, useContext } from "react";
export type Access = { permissions: Record<string, boolean>; administrator: boolean; canManageRoles: boolean };
export const AccessContext = createContext<Access>({ permissions: {}, administrator: false, canManageRoles: false });
export function useAccess() {
  const access = useContext(AccessContext);
  return { ...access, can: (...permissions: string[]) => permissions.every((key) => access.administrator || access.permissions[key] === true), any: (...permissions: string[]) => permissions.some((key) => access.administrator || access.permissions[key] === true) };
}
