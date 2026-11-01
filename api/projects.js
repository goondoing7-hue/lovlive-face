import { readBody, requireUser, send } from "./_lib.js";
import { createProjectsHandler } from "./_projects.js";

// Google 로그인과 기존 두 계정 허용 목록을 그대로 사용한다.
export default createProjectsHandler({ authorize: requireUser, readBody, send });
