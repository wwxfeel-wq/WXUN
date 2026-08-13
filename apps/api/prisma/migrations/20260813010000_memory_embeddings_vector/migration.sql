-- 将 memory_embeddings.embedding 从 text 改为 vector，启用 pgvector 向量检索。
-- 该表当前为空（0 条数据），无需数据迁移，直接 ALTER 即可。
-- 维度不固定，以支持本地 bge-small-zh（512 维）及未来云端 embedding（如 1536 维）。
ALTER TABLE "memory_embeddings" ALTER COLUMN "embedding" TYPE vector USING "embedding"::vector;
