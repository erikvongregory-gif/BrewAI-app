import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:mock.from})}));
vi.mock("@/lib/auth/owner",()=>({isPortalOperatorUserId:async()=>false}));
vi.mock("@/lib/supabase/privateAssets",()=>({hydratePrivateAssets:async(x:unknown)=>x}));
import { billingOwnerDenied, getWorkspace, getWorkspaceAccess, WorkspaceAccessError, workspaceErrorResponse } from "./workspace";
function query(result:unknown){return {select(){return this;},eq(){return this;},maybeSingle:async()=>result};}
function member(owner="owner"){return query({data:{owner_id:owner,role:"editor"},error:null});}
function billing(result:unknown){return {select(){return this;},eq(){return this;},single:async()=>result};}
function teamMemberWithBilling(result:unknown){
 mock.from.mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(member()).mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(billing(result));
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("NODE_ENV","production");});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("does not bypass deletion checks on production database errors",async()=>{
 mock.from.mockReturnValue(query({data:null,error:{code:"42P01"}}));
 await expect(getWorkspace("actor")).rejects.toThrow("Löschstatus");
});
it("does not invent owner permissions when membership storage is missing",async()=>{
 mock.from.mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(query({data:null,error:{code:"42P01"}}));
 await expect(getWorkspace("actor")).rejects.toThrow("Teamzuordnung");
});
it("permits the existing local bootstrap fallback only outside production",async()=>{
 vi.stubEnv("NODE_ENV","development");mock.from.mockReturnValue(query({data:null,error:{code:"42P01"}}));
 expect(await getWorkspace("actor")).toEqual({ownerId:"actor",role:"owner"});
});
it("blocks an existing deletion job",async()=>{
 mock.from.mockReturnValue(query({data:{user_id:"actor"},error:null}));
 await expect(getWorkspace("actor")).rejects.toThrow("Löschung vorgemerkt");
});
it("still denies access when the team subscription is inactive",async()=>{
 teamMemberWithBilling({data:{plan:"start",subscription_status:"canceled"},error:null});
 await expect(getWorkspace("actor")).rejects.toBeInstanceOf(WorkspaceAccessError);
});
it("reports an inactive team subscription as a typed state instead of throwing",async()=>{
 teamMemberWithBilling({data:{plan:"start",subscription_status:"canceled"},error:null});
 expect(await getWorkspaceAccess("actor")).toEqual({ok:false,reason:"team_subscription_inactive"});
});
it("treats a missing owner billing row as an inactive subscription",async()=>{
 teamMemberWithBilling({data:null,error:{code:"PGRST116"}});
 expect(await getWorkspaceAccess("actor")).toEqual({ok:false,reason:"team_subscription_inactive"});
});
it("treats a billing lookup failure as lookup_failed, not as an expired subscription",async()=>{
 teamMemberWithBilling({data:null,error:{code:"08006",message:"connection failure"}});
 expect(await getWorkspaceAccess("actor")).toEqual({ok:false,reason:"lookup_failed"});
});
it("maps database errors on the deletion check to lookup_failed",async()=>{
 mock.from.mockReturnValue(query({data:null,error:{code:"42P01"}}));
 expect(await getWorkspaceAccess("actor")).toEqual({ok:false,reason:"lookup_failed"});
});
it("answers API callers with German messages: blocked 403, outage 503",async()=>{
 const blocked=workspaceErrorResponse(new WorkspaceAccessError("team_subscription_inactive","x"));
 expect(blocked.status).toBe(403);
 expect(await blocked.json()).toEqual({error:expect.stringContaining("Abo deines Teams"),code:"team_subscription_inactive"});
 vi.spyOn(console,"error").mockImplementation(()=>{});
 expect(workspaceErrorResponse(new Error("boom")).status).toBe(503);
});
it("denies billing to team members and allows owners, without throwing",async()=>{
 teamMemberWithBilling({data:null,error:{code:"PGRST116"}});
 expect((await billingOwnerDenied("actor"))?.status).toBe(403);
 mock.from.mockReturnValue(query({data:null,error:null}));
 expect(await billingOwnerDenied("actor")).toBeNull();
});
