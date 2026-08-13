import { Injectable, Logger } from '@nestjs/common';
import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';

/**
 * 本地 embedding 模型名（中文语义向量，512 维）。
 * bge-small-zh-v1.5 体积约 100MB，适合 CPU 推理，无需外部 API。
 */
const LOCAL_EMBEDDING_MODEL = 'Xenova/bge-small-zh-v1.5';

// 使用国内镜像下载模型（HuggingFace 在国内访问不稳定），
// 并缓存到 /app/.cache（可挂 volume 持久化，避免每次部署重复下载）。
// 注意：remotePathTemplate 只含 {model} 和 {revision} 占位符，
// 具体文件名由 transformers.js 自动拼接，不要添加 {file}。
env.remoteHost = process.env.HF_ENDPOINT ?? 'https://hf-mirror.com';
env.cacheDir = process.env.TRANSFORMERS_CACHE ?? '/app/.cache/transformers';

/**
 * LocalEmbeddingService — 本地向量嵌入服务。
 *
 * 使用 Transformers.js (@xenova/transformers) 在 Node.js 内运行
 * ONNX 格式的 bge-small-zh 模型，将文本转换为 512 维向量。
 * 作为云端 embedding API（GLM/OpenAI/Qwen）的离线降级方案，
 * 使记忆检索（RAG）不依赖任何外部服务。
 *
 * 模型在首次调用时惰性加载（从 HuggingFace 下载或读取缓存），
 * 之后常驻内存复用，避免重复加载。
 */
@Injectable()
export class LocalEmbeddingService {
  private readonly logger = new Logger(LocalEmbeddingService.name);
  private extractor: FeatureExtractionPipeline | null = null;
  private loading: Promise<FeatureExtractionPipeline> | null = null;

  readonly modelName = LOCAL_EMBEDDING_MODEL;

  /** 惰性获取（必要时加载）特征提取 pipeline。 */
  private getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.extractor) return Promise.resolve(this.extractor);
    if (!this.loading) {
      this.loading = (async () => {
        this.logger.log(
          `Loading local embedding model: ${LOCAL_EMBEDDING_MODEL}...`,
        );
        const extractor = await pipeline(
          'feature-extraction',
          LOCAL_EMBEDDING_MODEL,
        );
        this.extractor = extractor;
        this.loading = null;
        this.logger.log('Local embedding model loaded (512-dim)');
        return extractor;
      })().catch((err) => {
        this.loading = null;
        this.logger.error(
          `Failed to load local embedding model: ${(err as Error).message}`,
        );
        throw err;
      });
    }
    return this.loading;
  }

  /** 生成单个文本的 embedding 向量（512 维，L2 归一化）。 */
  async embed(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data as Float32Array | number[]);
  }

  /** 批量生成 embedding（逐个推理，避免内存峰值）。 */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
