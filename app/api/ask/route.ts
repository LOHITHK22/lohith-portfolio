import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystemPrompt, VALID_SECTION_IDS, VALID_PROJECT_IDS } from "@/lib/portfolioContext";
import { checkRateLimit } from "@/lib/askRateLimit";

const MAX_QUESTION_LENGTH = 300;
const MAX_ANSWER_TOKENS = 300;

type AskResponse = {
  answer: string;
  projectId: string | null;
  sectionId: string | null;
};

function fallbackResponse(answer: string): NextResponse<AskResponse> {
  return NextResponse.json({ answer, projectId: null, sectionId: null });
}

export async function POST(req: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return fallbackResponse(
      "That question's a bit long for me. Try asking something shorter and more specific."
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return fallbackResponse(
      "This has gotten a lot of questions in the last hour. Please reach out directly via the contact section instead."
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackResponse(
      "The Q&A assistant isn't configured yet. You can reach out directly via the contact section below, or check the resume/projects sections for details."
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      max_tokens: MAX_ANSWER_TOKENS,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: question },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { answer?: unknown; project_id?: unknown; section_id?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallbackResponse("I had trouble putting that answer together. Try rephrasing the question?");
    }

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : "I don't have a good answer for that one. Try the contact section to ask him directly.";

    const projectId =
      typeof parsed.project_id === "string" && (VALID_PROJECT_IDS as string[]).includes(parsed.project_id)
        ? parsed.project_id
        : null;

    const sectionId =
      typeof parsed.section_id === "string" &&
      (VALID_SECTION_IDS as readonly string[]).includes(parsed.section_id)
        ? parsed.section_id
        : null;

    return NextResponse.json({ answer, projectId, sectionId } satisfies AskResponse);
  } catch (err) {
    console.error("[/api/ask] OpenAI request failed:", err);
    return fallbackResponse(
      "Something went wrong answering that. Please try again, or use the contact section below."
    );
  }
}
