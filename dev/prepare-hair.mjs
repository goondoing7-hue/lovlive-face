import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// GitHub에 루트로 업로드된 원본을 보존하고, 화면과 GPT 요청이 읽는 공개 경로에 복사한다.
const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "public", "hair");
const library = JSON.parse(await readFile(path.join(target, "library.json"), "utf8"));

await mkdir(target, { recursive: true });
for (const { id } of library) {
  if (!/^h\d+$/.test(id)) throw new Error(`잘못된 헤어 참고 사진 ID: ${id}`);
  try {
    await copyFile(path.join(root, `${id}.jpg`), path.join(target, `${id}.jpg`));
  } catch (error) {
    throw new Error(`헤어 참고 사진 ${id}.jpg 준비에 실패했습니다. 저장소의 원본 사진을 확인해 주세요.`, { cause: error });
  }
}
console.log(`헤어 참고 사진 ${library.length}장을 public/hair에 준비했습니다.`);
