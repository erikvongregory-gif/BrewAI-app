import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({twoFactor:vi.fn(),workspace:vi.fn()}));
vi.mock("@/lib/auth/twoFactorSession",()=>({hasPassedTwoFactor:mocks.twoFactor}));
vi.mock("@/lib/dashboard/workspace",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/dashboard/workspace")>(),workspaceResourceUser:mocks.workspace}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"actor",user_metadata:{}}}})}})}));
vi.mock("@/lib/supabase/env",()=>({isSupabaseConfigured:()=>true}));
vi.mock("@/lib/security/requestGuards",()=>({enforceSameOrigin:()=>null,enforceRateLimitPersistent:async()=>null}));
vi.mock("@/lib/billing/access",()=>({requireActiveSubscription:async()=>null}));
import { requireImageGenerationUser,requireAuthenticatedUser } from "@/app/(dashboard)/inhalte-erstellen/lib/api-guards";
import { WorkspaceAccessError } from "@/lib/dashboard/workspace";
beforeEach(()=>{vi.clearAllMocks();mocks.twoFactor.mockResolvedValue(false);});
it("rejects a first-factor session at both shared API boundaries",async()=>{
 for(const guard of [requireImageGenerationUser,requireAuthenticatedUser]){
  const result=await guard(new Request("https://example.com/api",{method:"POST"}),"test");
  expect(result.ok).toBe(false);if(!result.ok)expect(result.response.status).toBe(403);
 }
 expect(mocks.workspace).not.toHaveBeenCalled();
});
it("uses the workspace resource identity only after actor 2FA",async()=>{
 mocks.twoFactor.mockResolvedValue(true);
 mocks.workspace.mockResolvedValue({id:"workspace-owner",user_metadata:{brand:"shared"}});
 expect(await requireImageGenerationUser(new Request("https://example.com/api",{method:"POST"}),"test"))
  .toEqual({ok:true,userId:"workspace-owner",userMetadata:{brand:"shared"}});
 expect(mocks.twoFactor).toHaveBeenCalledWith({ id: "actor", user_metadata: {} });
});
it("fails closed when a viewer attempts a write",async()=>{
 mocks.twoFactor.mockResolvedValue(true);mocks.workspace.mockRejectedValue(new WorkspaceAccessError("read_only","read only"));
 const result=await requireAuthenticatedUser(new Request("https://example.com/api",{method:"POST"}),"test");
 expect(result.ok).toBe(false);if(!result.ok)expect(result.response.status).toBe(403);
});
