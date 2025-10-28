import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = `${process.env.SUPABASE_URL}` || "";
const SUPABASE_ANON_KEY = `${process.env.SUPABASE_ANON_KEY}` || "";
const SUPABASE_SERVICE_ROLE_KEY =
  `${process.env.SUPABASE_SERVICE_ROLE_KEY}` || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;