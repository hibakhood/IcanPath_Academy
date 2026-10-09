import "server-only";
import { redirect } from "next/navigation";
import { serverClient } from "./supabase/server";
export async function requireRole(role: "student" | "tutor" | "admin") {
 const client = await serverClient();
 const { data, error } = await client.auth.getUser();
 if (error || !data.user) redirect("/login");
 const { data: profile, error: profileError } = await client.from("profiles").select("id,role,status,full_name").eq("id",data.user.id).single();
 if (profileError || !profile || profile.status !== "active" || profile.role !== role) redirect("/access-denied");
 return { client, profile };
}
