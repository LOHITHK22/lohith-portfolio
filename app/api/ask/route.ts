import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystemPrompt, VALID_SECTION_IDS, VALID_PROJECT_IDS } from "@/lib/portfolioContext";
import { checkGlobalBudget, checkRateLimit } from "@/lib/askRateLimit";
import { checkAskRequest, clientKey, parseQuestion } from "@/lib/askGuard";

const MAX_QUESTION_LENGTH = 300;
const MAX_ANSWER_TOKENS = 300;

type AskResponse = {
  answer: string;
  projectId: string | null;
  sectionId: string | null;
};

// Answers are per visitor and must never be cached by a CDN or the browser.
const NO_STORE = { "Cache-Control": "no-store" };

function fallbackResponse(answer: string): NextResponse<AskResponse> {
  return NextResponse.json({ answer, projectId: null, sectionId: null }, { headers: NO_STORE });
}

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  // Same-origin JSON only, small bodies only: checked before anything is parsed or paid for.
  const rejected = checkAskRequest(req.headers, req.url);
  if (rejected) return errorResponse(rejected.status, rejected.error);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }
  const parsed = parseQuestion(text);
  if (parsed === null) return errorResponse(400, "Invalid request body.");
  const question = parsed;
  if (!question) {
    return errorResponse(400, "Question is required.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return fallbackResponse(
      "That question's a bit long for me. Try asking something shorter and more specific."
    );
  }

  const { allowed } = checkRateLimit(clientKey(req.headers));
  if (!allowed || !checkGlobalBudget()) {
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
    let reply: { answer?: unknown; project_id?: unknown; section_id?: unknown };
    try {
      reply = JSON.parse(raw);
    } catch {
      return fallbackResponse("I had trouble putting that answer together. Try rephrasing the question?");
    }

    const answer =
      typeof reply.answer === "string" && reply.answer.trim()
        ? reply.answer.trim()
        : "I don't have a good answer for that one. Try the contact section to ask him directly.";

    const projectId =
      typeof reply.project_id === "string" && (VALID_PROJECT_IDS as string[]).includes(reply.project_id)
        ? reply.project_id
        : null;

    const sectionId =
      typeof reply.section_id === "string" &&
      (VALID_SECTION_IDS as readonly string[]).includes(reply.section_id)
        ? reply.section_id
        : null;

    return NextResponse.json({ answer, projectId, sectionId } satisfies AskResponse, { headers: NO_STORE });
  } catch (err) {
    // Log the kind of failure only: never the error object, which can carry request details.
    const e = err as { name?: string; status?: number; code?: string };
    console.error("[/api/ask] OpenAI request failed:", e?.name ?? "Error", e?.status ?? "", e?.code ?? "");
    return fallbackResponse(
      "Something went wrong answering that. Please try again, or use the contact section below."
    );
  }
}
