import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Allow large image uploads for AI vision analysis
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Server-side AI Identification Endpoint using Gemini Vision
app.post('/api/ai/identify', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', candidateDescriptions = [] } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se proporcionó imagen para analizar.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada en las variables de entorno del servidor. Puedes buscar el producto manualmente.',
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Provide context about the store
    const prompt = `Actúas como un experto ferretero y tomador de inventarios de la ferretería y tienda de materiales de construcción "Construrama Alce".
Examina la fotografía de este artículo o producto de ferretería.
Identifica cuidadosamente:
1. Nombre común y comercial del producto en español mexicano (ej. "Tornillo hexagonal", "Llave combinada", "Codo PVC 90°", "Cintra métrica", "Disco de corte", "Candado de latón", "Pintura vinílica", etc.).
2. Marca visible o sugerida si se distingue (ej. Truper, Pretul, Iusa, Nacobre, Urrea, Fandeli, Comex, Helvex, DeWalt, etc., o "Genérico" si no hay).
3. Medida, calibre, diámetro, longitud o especificación física visible (ej. "1/2 pulgada", "3/4\"", "10 metros", "12 mm", "1 kg", "Galón", etc.).
4. Tipo / categoría ferretera (ej. "Plomería", "Tornillería", "Herramienta manual", "Eléctrico", "Pinturas", "Cerrajería", "Construcción").
5. Una descripción concisa combinando nombre, marca y medida.
6. Lista de 3 a 6 palabras o términos clave en minúsculas para buscar este producto en el catálogo.

${candidateDescriptions && candidateDescriptions.length > 0 ? `
Aquí tienes una lista de muestras del catálogo actual de la ferretería para ayudarte a elegir la terminología más parecida:
${candidateDescriptions.slice(0, 30).join(' | ')}
` : ''}

Responde estrictamente con el esquema JSON indicado.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nombre: { type: Type.STRING, description: 'Nombre común del producto' },
            marca: { type: Type.STRING, description: 'Marca si es visible o inferible' },
            medida: { type: Type.STRING, description: 'Medida, diámetro, longitud o capacidad' },
            tipo: { type: Type.STRING, description: 'Categoría o tipo de producto' },
            descripcionSugerida: { type: Type.STRING, description: 'Descripción comercial completa sugerida' },
            palabrasClave: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Términos clave para coincidencia con la base de productos',
            },
          },
          required: ['nombre', 'tipo', 'descripcionSugerida', 'palabrasClave'],
        },
      },
    });

    const text = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(text);
    } catch {
      parsedResult = {
        nombre: 'Artículo no especificado',
        marca: '',
        medida: '',
        tipo: 'Ferretería',
        descripcionSugerida: 'Artículo de ferretería',
        palabrasClave: ['herramienta', 'articulo', 'ferreteria'],
      };
    }

    return res.json({
      success: true,
      analysis: parsedResult,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error al procesar con Gemini:', error);
    return res.status(500).json({
      error: error.message || 'Error al comunicarse con la IA para identificar el producto.',
    });
  }
});

async function startServer() {
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Inventarios Construrama Alce escuchando en el puerto ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
