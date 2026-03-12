import { NextRequest } from "next/server";
import { getModel, parseModelString } from "@/lib/ai/providers";
import { resolveApiKey, resolveBaseUrl, resolveProxy } from "@/lib/server/provider-config";
import { callLLM } from "@/lib/ai/llm";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { ParsedPdfContent } from "@/lib/types/pdf";
import { createLogger } from '@/lib/logger'
import { apiError, apiSuccess } from '@/lib/server/api-response'
const log = createLogger('Classroom')


// Schema for the generated classroom structure
const SlideSchema = z.object({
  title: z.string().describe("Slide title"),
  content: z.string().describe("Main text content for the slide"),
  keyPoints: z.array(z.string()).describe("Key bullet points"),
  imageIndex: z
    .number()
    .optional()
    .describe("Index of image to use from PDF (0-based), if applicable"),
});

const ClassroomSchema = z.object({
  title: z.string().describe("Course title"),
  description: z.string().describe("Course description"),
  slides: z.array(SlideSchema).describe("Generated slides"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pdfContent,
      background,
      model,
      apiKey,
      baseUrl,
      providerType,
      requiresApiKey,
    } = body as {
      pdfContent: ParsedPdfContent;
      background?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
      providerType?: string;
      requiresApiKey?: boolean;
    };

    if (!pdfContent || !pdfContent.text) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF content provided');
    }

    const modelString = model || "gpt-4o-mini";
    const { providerId, modelId } = parseModelString(modelString);
    const effectiveApiKey = resolveApiKey(providerId, apiKey);
    const effectiveBaseUrl = resolveBaseUrl(providerId, baseUrl);
    const proxy = resolveProxy(providerId);
    log.info(`Using model: provider=${providerId}, model=${modelId}`);
    const { model: languageModel, modelInfo } = getModel({
      providerId,
      modelId,
      apiKey: effectiveApiKey || '',
      baseUrl: effectiveBaseUrl,
      proxy,
      providerType: providerType as 'openai' | 'anthropic' | 'google' | undefined,
      requiresApiKey,
    });

    const backgroundContext = background
      ? `\n\nStudent background: ${background}\nPlease adapt the content complexity and examples based on this background.`
      : "";

    const imagesContext =
      pdfContent.images.length > 0
        ? `\n\nNote: This PDF contains ${pdfContent.images.length} images. You can reference them in slides by including "imageIndex" field (0-based index).`
        : "";

    const systemMessage =
      "You are an expert educator. You MUST respond with valid JSON only, no additional text or markdown formatting.";
    const userMessage = `Create a presentation from the following PDF content.

PDF Content:
${pdfContent.text}${backgroundContext}${imagesContext}

Generate a JSON object with this exact structure:
{
  "title": "Course title",
  "description": "Course description",
  "slides": [
    {
      "title": "Slide title",
      "content": "Main text content for the slide",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "imageIndex": 0  // Optional: index of image to display (0-based), only include if relevant
    }
  ]
}

Requirements:
1. Create an engaging title and description
2. Generate 10-15 slides that cover the main topics
3. Each slide should have a title, main content, and 3-5 key points
4. Structure the content logically and pedagogically
5. Use clear explanations with practical examples
6. If images are available, use "imageIndex" to reference them in appropriate slides

Respond with ONLY the JSON object, no markdown code blocks or additional text.`;

    log.debug('AI Generation', { systemMessage: systemMessage.substring(0, 100), userMessageLength: userMessage.length, background: background || '(none)', imagesAvailable: pdfContent.images.length })

    const result = await callLLM({
      model: languageModel,
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      maxOutputTokens: modelInfo?.outputWindow,
    }, 'generate-classroom');

    log.debug('AI Response', { length: result.text.length, preview: result.text.substring(0, 200) })

    // Parse the JSON response
    let outputData: z.infer<typeof ClassroomSchema>;
    try {
      const jsonText = result.text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      outputData = ClassroomSchema.parse(JSON.parse(jsonText));

      log.debug('Parsed data', { title: outputData.title, slides: outputData.slides.length })
    } catch (parseError) {
      log.error('Failed to parse AI response', parseError)
      throw new Error("Failed to parse AI-generated content");
    }

    // Transform the result into the Stage format
    const stageId = nanoid(10);
    const scenes = outputData.slides.map((slide, index) => ({
      id: `scene_${nanoid(10)}`,
      type: "slide" as const,
      title: slide.title,
      transcript: slide.content,
      order: index,
      content: {
        type: "slide" as const,
        canvas: {
          id: `slide_${nanoid(10)}`,
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            themeColors: ["#5b9bd5", "#70ad47", "#ffc000", "#ed7d31"],
            fontColor: "#333333",
            fontName: "Microsoft YaHei",
            backgroundColor: "#ffffff",
            outline: {
              width: 0,
              color: "#000000",
              style: "solid" as const,
            },
            shadow: {
              h: 0,
              v: 0,
              blur: 0,
              color: "#000000",
            },
          },
          elements: [
            // Title element
            {
              type: "text" as const,
              id: `text_${nanoid(10)}`,
              left: 100,
              top: 100,
              width: 800,
              height: 80,
              rotate: 0,
              content: `<p style="text-align: center;"><span style="font-size: 36px; color: #5b9bd5;"><strong>${slide.title}</strong></span></p>`,
              defaultFontName: "Microsoft YaHei",
              defaultColor: "#5b9bd5",
              lineHeight: 1.2,
              opacity: 1,
            },
            // Image element (if imageIndex is provided and valid)
            ...(slide.imageIndex !== undefined &&
            slide.imageIndex >= 0 &&
            slide.imageIndex < pdfContent.images.length
              ? [
                  {
                    type: "image" as const,
                    id: `image_${nanoid(10)}`,
                    left: 550,
                    top: 220,
                    width: 350,
                    height: 350,
                    rotate: 0,
                    src: pdfContent.images[slide.imageIndex],
                    fixedRatio: true,
                    opacity: 1,
                  },
                ]
              : []),
            // Content element
            {
              type: "text" as const,
              id: `text_${nanoid(10)}`,
              left: 100,
              top: 220,
              width: slide.imageIndex !== undefined ? 400 : 800,
              height: 400,
              rotate: 0,
              content: `<p>${slide.content}</p><ul>${slide.keyPoints.map((point) => `<li>${point}</li>`).join("")}</ul>`,
              defaultFontName: "Microsoft YaHei",
              defaultColor: "#333333",
              lineHeight: 1.8,
              opacity: 1,
            },
          ],
          background: {
            type: "solid" as const,
            color: "#ffffff",
          },
        },
      },
    }));

    const stage = {
      id: stageId,
      name: outputData.title,
      description: outputData.description,
      language: "zh-CN",
      style: "interactive",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    log.debug('Final output', { stageId: stage.id, stageName: stage.name, scenesCount: scenes.length })

    return apiSuccess({ stage, scenes });
  } catch (error) {
    log.error('Error generating classroom:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to generate classroom', error instanceof Error ? error.message : 'Unknown error');
  }
}
