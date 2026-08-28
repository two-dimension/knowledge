import { structureTranscript } from "../../../lib/structure-transcript";

export async function POST(request: Request) {
  const body = await request.json() as { transcript?: string };
  const transcript = body.transcript?.trim() ?? "";
  if (transcript.length < 20) return Response.json({ error: "谈话文本过短，至少需要 20 个字符" }, { status: 400 });
  return Response.json({ suggestion: structureTranscript(transcript), modelUsed: false });
}
