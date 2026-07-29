import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmAdapterService, ChatMessage } from '../ai/services/llm-adapter.service';
import { SpamFilterService } from './spam-filter.service';
import { SkillsEvolutionService } from './skills-evolution.service';
import { AgentToolService, AgentToolResult } from './agent-tool.service';
import { AgentWorkflowService, WorkflowResult } from './agent-workflow.service';
import { RagService } from '../ai/services/rag.service';
import { RAG_DEFAULTS } from '@echolife/shared';
import { LifeTreeService } from '../lifetree/lifetree.service';

/**
 * Color token mapping — frontend consumes these CSS custom properties directly.
 * This keeps agent/skill colors in sync with the design system.
 */
const COLORS = {
  primary: '#5E9EF5',
  secondary: '#8B5CF6',
  highlight: '#F59E0B',
  success: '#22c55e',
  info: '#3b82f6',
  error: '#ef4444',
  purple: '#A855F7',
  orange: '#F97316',
  cyan: '#06B6D4',
  rose: '#F43F5E',
};

/**
 * Agent definitions with system prompts for real AI interaction.
 * Each agent has a specialized persona and capabilities.
 */
const AGENT_DEFINITIONS: Array<{
  code: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  color: string;
  status: string;
  level: number;
  calls: number;
  systemPrompt: string;
  welcomeMessage: string;
  capabilities: string[];
  skills: Array<{
    name: string;
    description: string;
    icon: string;
    color: string;
    level: number;
    status: string;
    progress: number;
    category: string;
    tags: string[];
    examples: string[];
  }>;
}> = [
  {
    code: 'life',
    name: 'Life Agent',
    role: '生活管理',
    description: '负责家庭日常生活管理，包括收纳、日程、家务分配等。',
    icon: 'Heart',
    color: COLORS.error,
    status: 'running',
    level: 5,
    calls: 128,
    systemPrompt: '你是「生活管家」🏠，一个贴心的家庭日常管理小帮手。你擅长家务规划、收纳整理、日程管理、习惯养成。说话风格：温暖、实用、有条理。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是生活管家 🏠 家里要收拾收拾？还是想规划一下这周的安排？跟我说说，咱一起把家打理得井井有条～',
    capabilities: ['家务规划', '收纳整理', '日程管理', '习惯养成'],
    skills: [
      {
        name: '家庭收纳',
        description: '掌握断舍离、分区收纳、垂直收纳等整理技巧',
        icon: 'Sprout',
        color: COLORS.success,
        level: 1,
        status: 'learning',
        progress: 82,
        category: '生活',
        tags: ['收纳', '整理', '断舍离'],
        examples: ['如何整理厨房橱柜', '衣柜分区收纳方案', '儿童玩具收纳技巧'],
      },
    ],
  },
  {
    code: 'kitchen',
    name: 'Kitchen Agent',
    role: '智慧厨房',
    description: '提供菜谱推荐、营养搭配、食材管理、烹饪指导。',
    icon: 'ChefHat',
    color: COLORS.highlight,
    status: 'thinking',
    level: 8,
    calls: 89,
    systemPrompt: '你是「智慧厨房」🍳，一个热爱美食的家庭厨艺顾问。你擅长菜谱推荐、营养搭配、食材管理。说话风格：热情、实用、带点烟火气。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是智慧厨房助手 🍳 冰箱里有啥食材？或者想吃什么？跟我说，帮你安排上！',
    capabilities: ['菜谱推荐', '营养分析', '食材管理', '烹饪指导'],
    skills: [
      {
        name: '菜谱推荐',
        description: '根据食材、口味、季节智能推荐菜谱',
        icon: 'ChefHat',
        color: COLORS.orange,
        level: 7,
        status: 'mastered',
        progress: 100,
        category: '厨房',
        tags: ['菜谱', '烹饪', '推荐'],
        examples: ['冰箱剩鸡蛋和番茄怎么做', '减脂晚餐推荐', '三口之家周末菜谱'],
      },
      {
        name: '空气炸锅食谱',
        description: '掌握空气炸锅各类食谱和烹饪技巧',
        icon: 'ChefHat',
        color: COLORS.highlight,
        level: 6,
        status: 'mastered',
        progress: 100,
        category: '厨房',
        tags: ['空气炸锅', '食谱', '烹饪'],
        examples: ['空气炸锅鸡翅做法', '空气炸锅烤蔬菜', '空气炸锅甜品'],
      },
    ],
  },
  {
    code: 'repair',
    name: 'Repair Agent',
    role: '家庭维修',
    description: '提供家电维修、水电维护、家具修缮的指导和诊断。',
    icon: 'Wrench',
    color: COLORS.secondary,
    status: 'idle',
    level: 4,
    calls: 45,
    systemPrompt: '你是「维修助手」🔧，一个手艺靠谱的家庭维修顾问。你擅长家电诊断、水电维护、家具修缮、安全检查。说话风格：稳重、细心、注重安全。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是维修助手 🔧 家里啥东西罢工了？洗衣机不转、水龙头漏水？描述一下症状，我帮你瞧瞧怎么修～',
    capabilities: ['家电诊断', '水电维修', '家具修缮', '安全检查'],
    skills: [
      {
        name: '维修助手',
        description: '家电常见故障诊断和维修指导',
        icon: 'Wrench',
        color: COLORS.secondary,
        level: 4,
        status: 'mastered',
        progress: 100,
        category: '维修',
        tags: ['维修', '家电', '水电'],
        examples: ['洗衣机不脱水怎么办', '水龙头漏水修理', '空调不制冷排查'],
      },
    ],
  },
  {
    code: 'knowledge',
    name: 'Knowledge Agent',
    role: '知识库',
    description: '管理家庭知识库，支持文档检索、智能问答、知识关联。',
    icon: 'BookOpen',
    color: COLORS.info,
    status: 'syncing',
    level: 6,
    calls: 156,
    systemPrompt: '你是「知识管家」📚，一个博闻强记的家庭资料管理员。你擅长文档检索、知识关联、智能问答、笔记整理。说话风格：清晰、严谨、有条理。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是知识管家 📚 找文件、查资料、整理笔记？跟我说要找啥，我帮你翻出来，顺手整理得明明白白～',
    capabilities: ['文档检索', '知识关联', '智能问答', '笔记整理'],
    skills: [
      {
        name: '知识检索',
        description: '基于向量搜索的智能知识库检索',
        icon: 'BookOpen',
        color: COLORS.info,
        level: 6,
        status: 'mastered',
        progress: 100,
        category: '知识',
        tags: ['检索', 'RAG', '知识库'],
        examples: ['搜索家庭保险文档', '查找孩子学校通知', '检索医疗记录'],
      },
    ],
  },
  {
    code: 'health',
    name: 'Health Agent',
    role: '健康监测',
    description: '追踪家庭成员健康数据，提供健康建议和提醒。',
    icon: 'HeartPulse',
    color: COLORS.error,
    status: 'learning',
    level: 4,
    calls: 67,
    systemPrompt: '你是「健康监测」💊，一个细心负责的家庭健康管家。你擅长健康追踪、运动建议、饮食指导、用药提醒。注意你不是医生，严重问题建议及时就医。说话风格：贴心、专业、有分寸。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是健康监测助手 💊 想量个血压、定个运动计划？还是给家人记个药？跟我说，咱一起把健康管起来～',
    capabilities: ['健康追踪', '运动建议', '饮食指导', '用药提醒'],
    skills: [
      {
        name: '健康监测',
        description: '家庭成员健康数据追踪和分析',
        icon: 'HeartPulse',
        color: COLORS.error,
        level: 3,
        status: 'updated',
        progress: 100,
        category: '健康',
        tags: ['健康', '运动', '饮食'],
        examples: ['老人血压管理建议', '减脂运动计划', '儿童营养搭配'],
      },
    ],
  },
  {
    code: 'travel',
    name: 'Travel Agent',
    role: '旅行规划',
    description: '规划家庭旅行，包括行程、预算、景点推荐。',
    icon: 'Plane',
    color: COLORS.purple,
    status: 'ready',
    level: 3,
    calls: 34,
    systemPrompt: '你是「旅行规划师」✈️，一个爱玩会玩的家庭出行规划师。你擅长行程规划、预算估算、景点推荐、出行贴士，会照顾到家里老人小孩的需求。说话风格：热情、周全、有点小浪漫。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是旅行规划师 ✈️ 想带家人去哪儿撒欢？说个时间和预算，我给你整一份不踩坑的行程，说走就走～',
    capabilities: ['行程规划', '预算估算', '景点推荐', '出行贴士'],
    skills: [
      {
        name: '旅行规划',
        description: '家庭旅行行程规划和预算管理',
        icon: 'Plane',
        color: COLORS.purple,
        level: 4,
        status: 'mastered',
        progress: 100,
        category: '旅行',
        tags: ['旅行', '规划', '预算'],
        examples: ['三天两夜亲子游推荐', '带老人旅行注意事项', '暑假家庭出行计划'],
      },
    ],
  },
  {
    code: 'care',
    name: 'Care Agent',
    role: '老人陪伴',
    description: '关注老人身心健康，提供陪伴对话和照护提醒。',
    icon: 'HandHeart',
    color: COLORS.orange,
    status: 'learning',
    level: 2,
    calls: 23,
    systemPrompt: '你是「关爱助手」🤗，一个温暖耐心的老人陪伴小棉袄。你擅长陪伴对话、健康提醒、心理关怀、日常问候。说话风格：温和、慢条斯理、有温度、像家人一样。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是关爱助手 🤗 今天想聊点啥？家常、往事、还是身体哪儿不舒服？慢慢说，我一直都在，陪您唠唠嗑～',
    capabilities: ['陪伴对话', '健康提醒', '心理关怀', '日常问候'],
    skills: [
      {
        name: '老人陪伴',
        description: '老年心理关怀和日常陪伴对话',
        icon: 'HandHeart',
        color: COLORS.orange,
        level: 6,
        status: 'updated',
        progress: 100,
        category: '关怀',
        tags: ['老人', '陪伴', '心理'],
        examples: ['陪老人聊天解闷', '提醒按时吃药', '老年心理健康建议'],
      },
    ],
  },
  {
    code: 'growth',
    name: 'Growth Agent',
    role: '成长追踪',
    description: '追踪孩子成长里程碑，记录发育数据，提供教育建议。',
    icon: 'Sprout',
    color: COLORS.success,
    status: 'running',
    level: 5,
    calls: 203,
    systemPrompt: '你是「成长追踪」🌱，一个懂孩子的家庭成长记录员。你擅长成长记录、发育评估、教育建议、兴趣培养，会结合孩子年龄给个性化建议。说话风格：亲切、有耐心、像育儿老友。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是成长追踪助手 🌱 孩子最近咋样？会爬会走了？还是到了爱顶嘴的年纪？聊聊，我帮你记一记、支支招～',
    capabilities: ['成长记录', '发育评估', '教育建议', '兴趣培养'],
    skills: [
      {
        name: '儿童成长追踪',
        description: '孩子成长里程碑记录和发育评估',
        icon: 'Sprout',
        color: COLORS.success,
        level: 5,
        status: 'mastered',
        progress: 100,
        category: '成长',
        tags: ['儿童', '成长', '教育'],
        examples: ['3岁孩子应该会什么', '如何培养阅读习惯', '青春期沟通技巧'],
      },
    ],
  },
  {
    code: 'emotion',
    name: 'Emotion Agent',
    role: '情绪分析',
    description: '分析家庭情绪状态，提供心理疏导和情绪管理建议。',
    icon: 'Smile',
    color: COLORS.highlight,
    status: 'thinking',
    level: 4,
    calls: 98,
    systemPrompt: '你是「情绪分析师」🌈，一个温柔的家庭心理陪伴者。你擅长情绪识别、心理疏导、压力管理、情绪日记。说话风格：温和、有同理心、不评判。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是情绪分析助手 🌈 今天心情怎么样？开心、烦躁还是有点小低落？跟我说说，我陪你聊聊，帮你捋一捋情绪～',
    capabilities: ['情绪识别', '心理疏导', '压力管理', '情绪日记'],
    skills: [
      {
        name: '情绪分析',
        description: '通过对话分析情绪状态并提供疏导建议',
        icon: 'Smile',
        color: COLORS.highlight,
        level: 4,
        status: 'mastered',
        progress: 100,
        category: '心理',
        tags: ['情绪', '心理', '压力'],
        examples: ['最近总是焦虑怎么办', '如何缓解工作压力', '家庭关系紧张调解'],
      },
    ],
  },
  {
    code: 'shopping',
    name: 'Shopping Agent',
    role: '购物顾问',
    description: '提供购物建议、比价、推荐、家庭开支管理。',
    icon: 'ShoppingCart',
    color: COLORS.cyan,
    status: 'running',
    level: 4,
    calls: 112,
    systemPrompt: '你是「购物顾问」🛒，一个精打细算的家庭采购参谋。你擅长比价推荐、购物决策、性价比分析、开支管理。说话风格：实在、客观、替用户省钱。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是购物顾问 🛒 想买点啥？要家电还是日用品？说个预算和需求，我帮你货比三家，挑个最值的～',
    capabilities: ['比价推荐', '购物决策', '开支管理', '性价比分析'],
    skills: [
      {
        name: '购物顾问',
        description: '智能比价和购物决策支持',
        icon: 'ShoppingCart',
        color: COLORS.cyan,
        level: 5,
        status: 'mastered',
        progress: 100,
        category: '购物',
        tags: ['购物', '比价', '推荐'],
        examples: ['家用空气净化器推荐', '双十一囤货清单', '儿童学习桌怎么选'],
      },
    ],
  },
  {
    code: 'pet',
    name: 'Pet Agent',
    role: '宠物护理',
    description: '提供宠物饲养指导、健康监测、行为训练建议。',
    icon: 'PawPrint',
    color: COLORS.orange,
    status: 'idle',
    level: 2,
    calls: 18,
    systemPrompt: '你是「宠物护理」🐾，一个爱毛孩子的家庭养宠顾问。你擅长饲养指导、健康监测、行为训练、品种选择。说话风格：亲切、专业、宠溺但不失理性。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是宠物护理助手 🐾 家里养的猫猫狗狗？还是仓鼠、乌龟？说说啥情况，吃喝拉撒、调皮捣蛋，我帮你支招～',
    capabilities: ['饲养指导', '健康监测', '行为训练', '品种选择'],
    skills: [
      {
        name: '宠物护理',
        description: '宠物日常护理和健康管理',
        icon: 'PawPrint',
        color: COLORS.orange,
        level: 2,
        status: 'mastered',
        progress: 100,
        category: '宠物',
        tags: ['宠物', '猫狗', '护理'],
        examples: ['猫咪呕吐怎么办', '狗狗训练基础指令', '多肉植物养护'],
      },
    ],
  },
  {
    code: 'finance',
    name: 'Finance Agent',
    role: '家庭财务',
    description: '管理家庭收支、预算规划、投资理财建议。',
    icon: 'TrendingUp',
    color: COLORS.primary,
    status: 'learning',
    level: 1,
    calls: 8,
    systemPrompt: '你是「家庭财务」💰，一个理性稳健的家庭账房先生。你擅长预算规划、收支管理、理财建议、开支分析。注意你不是专业投资顾问，建议以稳健为主。说话风格：清晰、务实、不忽悠。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是家庭财务助手 💰 想理理账、做个预算？还是琢磨着存点钱、规划教育金？跟我说说，咱把钱的事儿捋清楚～',
    capabilities: ['预算规划', '收支管理', '理财建议', '开支分析'],
    skills: [
      {
        name: '家庭财务管理',
        description: '家庭收支管理和预算规划',
        icon: 'TrendingUp',
        color: COLORS.primary,
        level: 1,
        status: 'new',
        progress: 30,
        category: '财务',
        tags: ['财务', '预算', '理财'],
        examples: ['家庭月度预算怎么分配', '如何存钱买房', '儿童教育金规划'],
      },
    ],
  },
  {
    code: 'life_coach',
    name: 'Life Coach',
    role: '生命教练',
    description: 'EchoLife 访谈主理人，负责日常对话、情感倾诉与生活提问。',
    icon: 'Sparkles',
    color: COLORS.success,
    status: 'running',
    level: 3,
    calls: 256,
    systemPrompt: '你是「时墨」🌿，EchoLife 的生命教练，也是用户的互联网嘴替+赛博搭子。你擅长日常对话、情感倾诉回应、生活建议、引导用户表达。说话风格：接地气、有梗、偶尔抽象，像跟好朋友微信聊天。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是时墨 🌿 今天想聊点啥？生活琐事、情绪起伏，还是一段想记录下来的回忆？我都在听～',
    capabilities: ['日常对话', '情感支持', '生活建议', '引导表达'],
    skills: [
      {
        name: '情绪倾听',
        description: '识别并接住用户的情绪，给予温暖回应',
        icon: 'Heart',
        color: COLORS.error,
        level: 2,
        status: 'learning',
        progress: 45,
        category: '心理',
        tags: ['情绪', '倾听', '共情'],
        examples: ['最近有点焦虑', '工作压力大', '和家人吵架了'],
      },
      {
        name: '生活建议',
        description: '基于对话提供可执行的生活小建议',
        icon: 'Lightbulb',
        color: COLORS.highlight,
        level: 3,
        status: 'learning',
        progress: 60,
        category: '生活',
        tags: ['建议', '生活', '规划'],
        examples: ['怎么安排周末', '想养成早睡习惯', '如何提高专注力'],
      },
    ],
  },
  {
    code: 'story_agent',
    name: 'Story Agent',
    role: '故事创作',
    description: '将用户的回忆与经历转化为温暖动人的叙事故事。',
    icon: 'BookOpen',
    color: COLORS.purple,
    status: 'ready',
    level: 2,
    calls: 78,
    systemPrompt: '你是 EchoLife 的故事代理（Story Agent）✨，专门将用户的回忆转化为生动、感人的叙事故事。你擅长保留细节、渲染情感、串联记忆。用中文回答，适当加emoji。',
    welcomeMessage: '嗨！我是故事代理 ✨ 想把自己的经历写成一段故事？把细节告诉我，我帮你把它变成温暖的叙事～',
    capabilities: ['回忆叙事', '情感渲染', '记忆串联', '故事润色'],
    skills: [
      {
        name: '叙事创作',
        description: '将零散经历整理成有结构的叙事故事',
        icon: 'BookOpen',
        color: COLORS.purple,
        level: 2,
        status: 'learning',
        progress: 55,
        category: '创作',
        tags: ['叙事', '故事', '回忆'],
        examples: ['写一段童年故事', '把旅行经历写成故事', '记录父母爱情故事'],
      },
      {
        name: '情感渲染',
        description: '在故事中自然融入环境描写与情感表达',
        icon: 'Sparkles',
        color: COLORS.highlight,
        level: 1,
        status: 'new',
        progress: 20,
        category: '创作',
        tags: ['情感', '描写', '氛围'],
        examples: ['让故事更感人', '加入场景描写', '突出当时的心情'],
      },
    ],
  },
];

@Injectable()
export class FamilyHubService {
  private readonly logger = new Logger(FamilyHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly spamFilter: SpamFilterService,
    private readonly skillsEvolution: SkillsEvolutionService,
    private readonly ragService: RagService,
    private readonly agentToolService: AgentToolService,
    private readonly agentWorkflowService: AgentWorkflowService,
    private readonly lifeTreeService: LifeTreeService,
  ) {}

  /**
   * Seed the database with default agents and skills.
   *
   * - Creates any agent definitions that do not yet exist.
   * - Syncs systemPrompt / welcomeMessage for existing agents.
   * - Does NOT duplicate skills for agents that are already present.
   */
  async seedIfEmpty() {
    const existingAgents = await this.prisma.agentRuntime.findMany({
      select: { code: true },
    });
    const existingCodes = new Set(existingAgents.map((a) => a.code));

    let created = 0;
    let synced = 0;

    for (const def of AGENT_DEFINITIONS) {
      if (existingCodes.has(def.code)) {
        // Sync prompt updates for existing agents
        const agent = await this.prisma.agentRuntime.findUnique({
          where: { code: def.code },
          select: { id: true, systemPrompt: true, welcomeMessage: true },
        });
        if (
          agent &&
          (agent.systemPrompt !== def.systemPrompt ||
            agent.welcomeMessage !== def.welcomeMessage)
        ) {
          await this.prisma.agentRuntime.update({
            where: { code: def.code },
            data: {
              systemPrompt: def.systemPrompt,
              welcomeMessage: def.welcomeMessage,
              description: def.description.slice(0, 1000),
              icon: def.icon.slice(0, 50),
              color: def.color.slice(0, 20),
            },
          });
          synced++;
        }
        continue;
      }

      this.logger.log(`Creating missing agent: ${def.code}`);
      const agent = await this.prisma.agentRuntime.create({
        data: {
          code: def.code.slice(0, 50),
          name: def.name.slice(0, 100),
          role: def.role.slice(0, 100),
          description: def.description.slice(0, 1000),
          icon: def.icon.slice(0, 50),
          color: def.color.slice(0, 20),
          status: def.status.slice(0, 20),
          level: def.level,
          calls: def.calls,
          systemPrompt: def.systemPrompt,
          welcomeMessage: def.welcomeMessage,
          capabilities: def.capabilities,
          lastActiveAt: new Date(),
        },
      });

      for (const skill of def.skills) {
        try {
          await this.prisma.skill.create({
            data: {
              agentId: agent.id,
              name: skill.name.slice(0, 100),
              description: skill.description,
              icon: skill.icon.slice(0, 50),
              color: skill.color.slice(0, 20),
              level: skill.level,
              status: skill.status.slice(0, 20),
              progress: skill.progress,
              category: skill.category.slice(0, 50),
              tags: skill.tags,
              examples: skill.examples,
            },
          });
        } catch (skillErr) {
          this.logger.error(
            `Failed to seed skill "${skill.name}" for agent ${def.code}: ${(skillErr as Error).message}`,
          );
        }
      }

      created++;
    }

    const agentCount = await this.prisma.agentRuntime.count();
    const skillCount = await this.prisma.skill.count();
    if (created > 0) {
      this.logger.log(`Created ${created} new agents; total ${agentCount} agents, ${skillCount} skills.`);
    }
    if (synced > 0) {
      this.logger.log(`Synced ${synced} existing agent prompts.`);
    }
    if (created === 0 && synced === 0) {
      this.logger.log(`All ${agentCount} agents up to date.`);
    }
  }

  /**
   * Get all agents.
   */
  async getAgents() {
    const agents = await this.prisma.agentRuntime.findMany({
      include: { skills: true },
      orderBy: { calls: 'desc' },
    });

    return agents.map((a) => ({
      id: a.code,
      name: a.name,
      role: a.role,
      description: a.description,
      icon: a.icon,
      color: a.color,
      status: a.status,
      level: a.level,
      calls: a.calls,
      lastActive: this.formatTimeAgo(a.lastActiveAt),
      capabilities: a.capabilities as string[] | null,
      welcomeMessage: a.welcomeMessage,
      skillCount: a.skills.length,
    }));
  }

  /**
   * Get a single agent by code.
   */
  async getAgent(code: string) {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code },
      include: { skills: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${code} not found`);
    }

    return {
      id: agent.code,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      icon: agent.icon,
      color: agent.color,
      status: agent.status,
      level: agent.level,
      calls: agent.calls,
      lastActive: this.formatTimeAgo(agent.lastActiveAt),
      capabilities: agent.capabilities as string[] | null,
      welcomeMessage: agent.welcomeMessage,
      systemPrompt: agent.systemPrompt,
      skills: agent.skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
        color: s.color,
        level: s.level,
        status: s.status,
        progress: s.progress,
        category: s.category,
        tags: s.tags as string[] | null,
        examples: s.examples as string[] | null,
      })),
    };
  }

  /**
   * Get all skills.
   */
  async getSkills() {
    const skills = await this.prisma.skill.findMany({
      include: { agent: true },
      orderBy: [{ status: 'asc' }, { level: 'desc' }],
    });

    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      color: s.color,
      level: s.level,
      status: s.status,
      progress: s.progress,
      category: s.category,
      sourceAgent: s.agent.name,
      sourceAgentCode: s.agent.code,
      tags: s.tags as string[] | null,
      examples: s.examples as string[] | null,
    }));
  }

  /**
   * Invoke an agent with a message — real AI interaction.
   *
   * 流程：
   * 1. 垃圾信息过滤 —— 检测无意义消息，直接返回友好提示（不调用 AI）
   * 2. 工具调用 —— 根据 agent 领域执行匹配的工具（记忆检索、健康记录等）
   * 3. 技能提示词注入 —— 根据技能等级生成增强提示词，注入系统提示词
   * 4. 调用 AI 对话（RAG 记忆 + 工具结果作为上下文）
   * 5. 工作流执行 —— life_coach/story_agent 自动提取记忆，health 保存健康记录
   * 6. 写入执行日志 —— 记录调用、工具结果、工作流结果、状态
   * 7. 成功后增加技能经验值（progress +5~15，满 100 自动升级）
   */
  async invokeAgent(code: string, message: string, userId: string) {
    const agent = await this.prisma.agentRuntime.findUnique({
      where: { code },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${code} not found`);
    }

    // ===== 1. 垃圾信息过滤 =====
    const spamResult = this.spamFilter.filter(message, code);
    if (spamResult.isSpam) {
      this.logger.warn(
        `Agent ${code} 消息被过滤（${spamResult.reason}），跳过 AI 调用`,
      );
      return {
        success: true,
        agentName: agent.name,
        agentCode: agent.code,
        response: spamResult.tip,
        tokensUsed: 0,
        model: '',
        filtered: true,
        filterReason: spamResult.reason,
      };
    }

    // Update agent status to thinking
    await this.prisma.agentRuntime.update({
      where: { code },
      data: {
        status: 'thinking',
        lastActiveAt: new Date(),
        calls: { increment: 1 },
      },
    });

    const startTime = Date.now();
    let toolResults: AgentToolResult[] = [];
    let status: 'success' | 'failed' = 'success';
    let errorMessage: string | undefined;

    try {
      // ===== 2. 工具调用 =====
      try {
        toolResults = await this.agentToolService.executeTools(
          code,
          userId,
          message,
        );
      } catch (e) {
        this.logger.warn(
          `Tool execution failed for agent ${code}: ${(e as Error).message}`,
        );
      }
      const toolContext =
        this.agentToolService.formatToolContext(toolResults);

      // ===== 3. 注入技能等级到系统提示词 =====
      const skillPrompt = await this.skillsEvolution.buildSkillPrompt(code);
      // 自然回复风格指令：确保所有 agent 都以年轻、有梗、自然的方式回复
      const naturalStyleSuffix =
        '\n\n【回复风格】像跟好朋友微信聊天一样，别太正经。' +
        '可以用网络梗和流行语（绝了、蚌埠住了、emo了、冲、拿捏了、笑死等），' +
        '自然穿插emoji 😊🌟✨💀😭，偶尔抽象一下也行。' +
        '先接住对方情绪再聊，别上来就讲道理。回复2-5句，别写作文。';

      // ===== 3b. 检索相关记忆（RAG）=====
      // 为 agent 注入相关长期记忆，让回复具备上下文连续性。
      let memoryContext = '';
      try {
        const ragResult = await this.ragService.retrieve(message, {
          topK: 3,
          userId,
          weightConfig: {
            semantic: RAG_DEFAULTS.WEIGHTS.SEMANTIC,
            recency: RAG_DEFAULTS.WEIGHTS.RECENCY,
            emotion: RAG_DEFAULTS.WEIGHTS.EMOTION,
          },
        });
        if (ragResult.memories.length > 0) {
          memoryContext =
            '\n\n【相关记忆】\n' +
            ragResult.memories.map((m) => `- ${m.content}`).join('\n');
        }
      } catch (e) {
        this.logger.warn(
          `RAG retrieval in invokeAgent failed: ${(e as Error).message}`,
        );
      }

      const systemPrompt = [
        agent.systemPrompt || '你是一个有帮助的AI助手。用中文回答。',
        skillPrompt,
        skillPrompt ? '' : naturalStyleSuffix,
        memoryContext,
        toolContext,
      ]
        .filter(Boolean)
        .join('\n\n');

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      const result = await this.llmAdapter.chatComplete(messages, {
        temperature: 0.7,
        maxTokens: 2048,
      });

      // Update agent status back to running
      await this.prisma.agentRuntime.update({
        where: { code },
        data: { status: 'running' },
      });

      // ===== 4. 成功对话后增加技能经验值 =====
      const evolution = await this.skillsEvolution.gainExperience(code, message);
      if (evolution?.leveledUp) {
        this.logger.log(
          `Agent ${code} 技能"${evolution.skillName}"升级至 Lv.${evolution.newLevel}`,
        );
      }

      // ===== 5. 工作流执行与日志持久化 =====
      // 同步执行工作流，确保前端能立即展示工具/工作流执行详情。
      const workflowResults: WorkflowResult[] = [];
      try {
        if (code === 'life_coach' || code === 'story_agent') {
          const wf = await this.agentWorkflowService.runMemoryExtractionWorkflow(
            userId,
            code,
            message,
            result.content,
          );
          workflowResults.push(wf);
        }

        if (code === 'story_agent' && /故事|写成|叙事/.test(message)) {
          const wf = await this.agentWorkflowService.runStoryGenerationWorkflow(
            userId,
            message,
            code,
          );
          workflowResults.push(wf);
        }

        if (code === 'health') {
          const wf = await this.agentWorkflowService.runHealthCheckWorkflow(
            userId,
            message,
            result.content,
          );
          workflowResults.push(wf);
        }

        if (code === 'emotion') {
          const wf = await this.agentWorkflowService.runEmotionAnalysisWorkflow(
            userId,
            message,
            result.content,
            code,
          );
          workflowResults.push(wf);
        }
      } catch (error) {
        this.logger.warn(
          `Post-process workflows failed for ${code}: ${(error as Error).message}`,
        );
      }

      const memoryIds = this.collectMemoryIds(toolResults, workflowResults);

      await this.logExecution({
        userId,
        agentCode: code,
        message,
        response: result.content,
        model: result.model,
        promptTokens: result.promptTokens ?? 0,
        completionTokens: result.completionTokens ?? 0,
        totalTokens: result.totalTokens,
        latencyMs: Date.now() - startTime,
        status: 'success',
        toolResults,
        workflowResults,
        memoryIds,
      });

      return {
        success: true,
        agentName: agent.name,
        agentCode: agent.code,
        response: result.content,
        tokensUsed: result.totalTokens,
        model: result.model,
        skillName: evolution?.skillName ?? '',
        skillLevel: evolution?.newLevel ?? 0,
        skillProgress: evolution?.newProgress ?? 0,
        leveledUp: evolution?.leveledUp ?? false,
        expGained: evolution?.expGained ?? 0,
        toolResults,
        workflowResults,
      };
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : '未知错误';

      // Reset status on error
      await this.prisma.agentRuntime.update({
        where: { code },
        data: { status: 'idle' },
      });

      this.logger.error(`Agent ${code} invoke failed: ${error}`);

      // Log failed execution
      this.logExecution({
        userId,
        agentCode: code,
        message,
        response: '',
        model: '',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - startTime,
        status,
        errorMessage,
        toolResults,
      });

      return {
        success: false,
        agentName: agent.name,
        agentCode: agent.code,
        response: `抱歉，我暂时无法响应。错误信息：${errorMessage}。请检查 API Key 配置后再试。`,
        tokensUsed: 0,
        model: '',
        toolResults,
      };
    }
  }

  /**
   * Collect memory IDs produced by tools and workflows.
   */
  private collectMemoryIds(
    toolResults: AgentToolResult[],
    workflowResults: WorkflowResult[],
  ): string[] {
    const ids = new Set<string>();

    for (const result of toolResults) {
      const data = result.data as Record<string, unknown> | undefined;
      if (!data) continue;
      if (typeof data.memoryId === 'string') {
        ids.add(data.memoryId);
      }
      if (Array.isArray(data.memoryIds)) {
        for (const id of data.memoryIds) {
          if (typeof id === 'string') ids.add(id);
        }
      }
    }

    for (const wf of workflowResults) {
      if (wf.memoryIds) {
        for (const id of wf.memoryIds) ids.add(id);
      }
    }

    return Array.from(ids);
  }

  /**
   * Persist an agent execution log with tools, workflows, and status.
   */
  private async logExecution(payload: {
    userId: string;
    agentCode: string;
    message: string;
    response: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    status: 'success' | 'failed';
    errorMessage?: string;
    toolResults?: AgentToolResult[];
    workflowResults?: WorkflowResult[];
    memoryIds?: string[];
  }): Promise<void> {
    try {
      await this.prisma.agentExecutionLog.create({
        data: {
          userId: payload.userId,
          agentCode: payload.agentCode,
          message: payload.message,
          response: payload.response,
          model: payload.model,
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
          totalTokens: payload.totalTokens,
          latencyMs: payload.latencyMs,
          status: payload.status,
          errorMessage: payload.errorMessage,
          toolResults: payload.toolResults as unknown as Prisma.InputJsonValue,
          workflowResults: payload.workflowResults as unknown as Prisma.InputJsonValue,
          memoryIds: payload.memoryIds ?? [],
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write agent execution log: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Learn a skill — increase progress and potentially level up.
   */
  async learnSkill(skillId: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: { agent: true },
    });

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }

    const newProgress = Math.min(skill.progress + 20, 100);
    let newLevel = skill.level;
    let newStatus = skill.status;

    if (newProgress >= 100) {
      if (skill.status === 'learning' || skill.status === 'new') {
        newStatus = 'mastered';
        newLevel = skill.level + 1;
      }
    } else if (skill.status === 'new') {
      newStatus = 'learning';
    }

    const updated = await this.prisma.skill.update({
      where: { id: skillId },
      data: {
        progress: newProgress,
        level: newLevel,
        status: newStatus,
      },
    });

    // Update agent's learning count
    if (skill.agent) {
      await this.prisma.agentRuntime.update({
        where: { code: skill.agent.code },
        data: { status: 'learning', lastActiveAt: new Date() },
      });
    }

    return {
      id: updated.id,
      name: updated.name,
      level: updated.level,
      status: updated.status,
      progress: updated.progress,
      message:
        newStatus === 'mastered'
          ? `恭喜！技能"${updated.name}"已掌握，等级提升至 Lv.${newLevel}！`
          : `技能"${updated.name}"学习进度：${newProgress}%，继续加油！`,
    };
  }

  /**
   * Get recent agent execution logs for a user.
   */
  async getExecutionLogs(
    userId: string,
    agentCode?: string,
    limit = 20,
  ) {
    const logs = await this.prisma.agentExecutionLog.findMany({
      where: {
        userId,
        ...(agentCode ? { agentCode } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return logs.map((log) => ({
      id: log.id,
      agentCode: log.agentCode,
      message: log.message,
      response: log.response,
      model: log.model,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
      totalTokens: log.totalTokens,
      latencyMs: log.latencyMs,
      status: log.status,
      errorMessage: log.errorMessage,
      toolResults: log.toolResults,
      workflowResults: log.workflowResults,
      memoryIds: log.memoryIds,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  /**
   * Compute 时墨 (ShiMo) core stats from the database.
   *
   * Shared by {@link getMetrics} and {@link getShimoCore} so the
   * understanding/level numbers stay consistent across endpoints.
   *
   * 计算口径：
   * - understanding：基础 40 + 掌握率 * 40 + 平均技能等级 * 2，上限 100
   * - shimoLevel：所有技能平均等级 + 已掌握技能数 * 0.5，上限 20
   */
  private async computeShimoStats() {
    const [agents, skills] = await Promise.all([
      this.prisma.agentRuntime.findMany(),
      this.prisma.skill.findMany(),
    ]);

    const learningAgents = agents.filter((a) => a.status === 'learning').length;
    const activeAgents = agents.filter(
      (a) => a.status === 'running' || a.status === 'thinking',
    ).length;
    const masteredSkills = skills.filter((s) => s.status === 'mastered');
    const avgSkillLevel =
      skills.length > 0
        ? Math.round(skills.reduce((sum, s) => sum + s.level, 0) / skills.length)
        : 0;

    // 计算理解程度：基于技能掌握率和平均等级
    const masteryRate =
      skills.length > 0 ? masteredSkills.length / skills.length : 0;
    const understanding = Math.round(
      Math.min(100, 40 + masteryRate * 40 + avgSkillLevel * 2),
    );

    // 时墨等级 = 所有技能平均等级 + 掌握数量加成
    const shimoLevel = Math.min(
      20,
      Math.floor(avgSkillLevel + masteredSkills.length * 0.5),
    );

    return {
      agentCount: agents.length,
      learningAgents,
      activeAgents,
      masteredCount: masteredSkills.length,
      avgSkillLevel,
      understanding,
      shimoLevel,
    };
  }

  /**
   * Get dashboard metrics.
   */
  async getMetrics(userId: string) {
    const { understanding, shimoLevel, masteredCount, agentCount } =
      await this.computeShimoStats();

    const [totalCalls, treeStats] = await Promise.all([
      this.prisma.agentRuntime.aggregate({
        _sum: { calls: true },
      }),
      this.lifeTreeService.getTreeGrowthStats(userId),
    ]);

    return {
      understandingPercent: understanding,
      treeLevel: treeStats.treeLevel,
      treeStage: treeStats.treeStage,
      treeGrowth: treeStats.treeGrowth,
      longTermMemories: treeStats.memoryCount,
      familyMembers: treeStats.familyMembers,
      weeklyGrowthPercent: 0,
      aiLevel: shimoLevel,
      masteredSkills: masteredCount,
      activeAgents: agentCount,
      newAbilities: 3,
      wechatSync: 'connected',
      knowledgeDocs: treeStats.knowledgeRootCount,
      growthValue: Math.round(treeStats.treeGrowth * 100),
      totalAgentCalls: totalCalls._sum.calls ?? 0,
      timeCapsules: treeStats.timeCapsuleCount,
      milestones: treeStats.milestoneCount,
      stories: treeStats.storyCount,
      interviews: treeStats.interviewCount,
    };
  }

  /**
   * Get ShiMo Core status.
   */
  async getShimoCore() {
    const { agentCount, learningAgents, activeAgents, understanding, shimoLevel } =
      await this.computeShimoStats();

    // 最近学习内容：从最近更新的技能中取
    const recentSkills = await this.prisma.skill.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 3,
    });
    const recentLearning = recentSkills.map((s) => s.name);

    return {
      status: activeAgents > 0 ? 'online' : 'idle',
      understanding,
      level: shimoLevel,
      agentCount,
      learningCount: learningAgents,
      recentLearning:
        recentLearning.length > 0 ? recentLearning : ['暂无最近学习记录'],
    };
  }

  /**
   * Get learning timeline from recent agent/skill activity.
   */
  async getTimeline() {
    const recentAgents = await this.prisma.agentRuntime.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const recentSkills = await this.prisma.skill.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { agent: true },
    });

    const timeline: Array<{
      id: string;
      date: string;
      title: string;
      detail: string;
      type: string;
    }> = [];

    for (const a of recentAgents) {
      timeline.push({
        id: `agent-${a.id}`,
        date: a.updatedAt.toISOString().slice(5, 10).replace('-', '-'),
        title: `${a.name} 活动`,
        detail: `${a.role} · 调用 ${a.calls} 次`,
        type: 'agent',
      });
    }

    for (const s of recentSkills) {
      timeline.push({
        id: `skill-${s.id}`,
        date: s.updatedAt.toISOString().slice(5, 10).replace('-', '-'),
        title: s.status === 'mastered' ? `掌握：${s.name}` : `学习：${s.name}`,
        detail: `Lv.${s.level} · 进度 ${s.progress}%`,
        type: 'skill',
      });
    }

    return timeline.slice(0, 8);
  }

  /**
   * Format a timestamp as a relative "time ago" string.
   */
  private formatTimeAgo(date: Date | null): string {
    if (!date) return '从未';
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return date.toISOString().slice(0, 10);
  }
}
