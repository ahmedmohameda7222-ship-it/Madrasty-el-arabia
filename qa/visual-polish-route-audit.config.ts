import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { requireFixtureTarget } from "./support/target";
loadEnvFile("qa/.env.local");
requireFixtureTarget(process.env);
if(process.env.GITHUB_ACTIONS!=="true"||process.env.GITHUB_REF!=="refs/heads/visual-polish/premium"||!process.env.NODE_EXTRA_CA_CERTS)throw Error("Route audit requires the disposable trusted fixture");
export default defineConfig({testDir:"./visual-polish-route-audit",testMatch:"routes.spec.ts",workers:1,timeout:600_000,expect:{timeout:30000},outputDir:process.env.VISUAL_POLISH_SURVEY_STAGE?"../qa-artifacts/visual-polish/route-survey-matched/"+process.env.VISUAL_POLISH_SURVEY_STAGE+"/test-results":"../qa-artifacts/visual-polish/route-survey/test-results",use:{baseURL:"https://127.0.0.1:4443",ignoreHTTPSErrors:false}});
