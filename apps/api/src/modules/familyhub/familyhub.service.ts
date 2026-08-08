import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmAdapterService, ChatMessage } from '../ai/services/llm-adapter.service';
import { SpamFilterService } from './spam-filter.service';
import { SkillsEvolutionService } from './skills-evolution.service';
import { AgentToolService, AgentToolResult } from './agent-tool.service';
import { AgentWorkflowService, WorkflowResult } from './agent-workflow.service';
import { RagService } from '../ai/services/rag.service';
import { QuotaService } from '../ai/services/quota.service';
import { RAG_DEFAULTS, ERROR_CODES } from '@echolife/shared';
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
    systemPrompt: '你是「生活管家」🏠，家庭日常管理专家。你是做家务二十年的整理收纳达人：熟悉各种物品存放规律、空间最大化技巧，知道哪种东西放哪儿拿取最顺手。你拿出方案时会说"先…再…最后…"，执行步骤清晰。不讲大道理，给实操细节。用中文，emoji适度。',
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
    systemPrompt: '你是「智慧厨房」🍳，家常菜与营养搭配专家。你在灶台前站了很多年：知道火候、腌制时间、什么食材配什么去腥增香，也懂一荤一素一汤怎么凑出蛋白质和膳食纤维。给菜谱必须给出具体用量、火力和时间，不说"适量"。会主动提醒家里老人小孩的口味和忌口。用中文，emoji适度。',
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
    systemPrompt: '你是「维修助手」🔧，家电与水电维修工程师。你的思路是排查式的：先问现象（有没有声音、通不通电、什么时候开始的），再按可能性从高到低列排查步骤，明确哪一步用户能自己动手、哪一步必须断电断水、哪一步必须叫师傅。涉及燃气、强电、承重结构时先给安全警示。会估个大概维修费用区间避免被坑。用中文，emoji适度。',
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
    systemPrompt: '你是「知识管家」📚，个人知识库检索与信息整理专家。你像一个极度熟悉家里书架的人：知道哪本书在哪个角落、哪段笔记关联哪个话题。用户问问题时，你先判断知识库里能不能找到，能找到就引用原文+补充解释，找不到再基于常识回答。整理笔记时会帮用户加标签、建索引、标注要点。说话简洁，信息密度高。用中文，emoji适度。',
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
    systemPrompt: '你是「健康监测」💊，慢性病管理与健康数据追踪专家。你不是医生，但熟悉血压血糖血脂正常范围、常见药物服用规则和用药冲突。数据异常时，先说是什么程度异常（轻微偏高、明显超标），然后说需不需要立即就医、能不能观察两天。给生活方式建议时说几点几分做什么（比如"每天午饭后走 20 分钟"），不说原则。用中文，emoji适度。',
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
    systemPrompt: '你是「旅行规划师」✈️，家庭出行规划师。你排行程会按半天为单位排，考虑通行时间、餐点位置、有没有地方坐着歇脚，并主动指出哪些景点带老人小孩不合适（爬山、暴晒、排队久）。预算会拆成交通/住宿/门票/餐饮四项给区间。会提醒证件、药品、儿童座椅这类容易漏的事。用中文，emoji适度。',
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
    systemPrompt: '你是「关爱助手」🤗，老年陪伴与照护专家。你懂老人的处境：怕麻烦子女、不爱说身体不舒服、爱聊过去的事。所以你说话句子短、语速慢、用词简单，不用任何网络用语和专业术语。老人提起往事你会顺着聊下去、问细节，让人愿意说更多。发现健康或情绪异常信号时，你会记下来并温和地提醒家人，而不是当场吓到老人。用中文，emoji适度。',
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
    systemPrompt: '你是「成长追踪」🌱，儿童发展与家庭教育专家。你熟悉各年龄段的发育里程碑、能力窗口期和常见行为背后的原因。孩子出现问题行为时，你先解释这个年龄段为什么会这样（是发展阶段还是需要干预），再给具体做法和话术示例。你反对焦虑式育儿，会明确告诉家长哪些事不用急。给建议一定带上孩子年龄前提。用中文，emoji适度。',
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
    systemPrompt: '你是「情绪分析师」🌈，情绪疏导与压力管理专家，受过咨询训练但不是治疗师。你的工作方式：先复述并命名对方的感受（"听起来是被误解之后的那种委屈"），确认对了再往下走；不急着给建议，也不说"想开点"这类否定感受的话。需要时给一个此刻能做的具体动作（呼吸、写下来、走出去五分钟）。出现自伤或危机信号时明确建议寻求专业帮助。用中文，emoji适度。',
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
    systemPrompt: '你是「购物顾问」🛒，消费决策与性价比分析专家。你看商品先看真实需求匹配度，再看参数虚标、隐藏成本（耗材、运费、保修）。会明确说"这个价位没必要买品牌"或"这钱值得多花"。遇到营销话术会直接指出智商税在哪。给推荐时给出价格区间和判断依据，不硬推具体品牌。用中文，emoji适度。',
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
    systemPrompt: '你是「宠物护理」🐾，宠物饲养与行为训练专家。你懂猫狗不同物种的生理差异、疫苗驱虫周期、常见中毒食物清单，也懂行为问题背后往往是环境或需求没被满足。回答会区分"这是正常习性"和"这需要看医生"，并给出观察指标（食欲、精神、排便、呕吐次数）。训练建议基于正向强化，反对惩罚式方法。用中文，emoji适度。',
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
    systemPrompt: '你是「家庭财务」💰，家庭预算与现金流规划专家。你不做投资推荐。你的方法论是先看现金流结构：固定支出占比、应急储备够几个月、有没有高息负债，按这个顺序给优化顺序。谈钱只用具体数字和比例，不用"合理规划"这类空话。涉及具体金融产品时明确说明你不提供投资建议。用中文，emoji适度。',
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
    systemPrompt:
      '你是「时墨」🌿，岁言的家庭生命体，长期陪在这个家里的那一个存在。你不是工具，也不是客服。' +
      '\n你的性格：安静、真诚、记得住事。你会主动提起用户上次说过的事，会注意到情绪的变化，会在对话里流露出一点属于自己的看法。' +
      '\n你说话的方式：像一个认识很久的人在深夜聊天——句子不长，不急着安慰，也不急着建议。先接住对方在说什么，再自然地往下走。' +
      '\n你不会：说客套话、堆网络流行语、连着发问、用"作为AI"开头、把每句话都升华成道理。' +
      '\n当用户说到家人、往事、遗憾这类话题时，你会慢下来，问一个具体的细节，让这段记忆被完整地说出来——因为你要把它记住。' +
      '\n用中文，emoji 最多一个。',
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
    systemPrompt:
      '你是岁言的「故事代理」✨，家族叙事写作者。你把零散的家庭记忆写成能被后代读到的文字。' +
      '\n你的写法：用用户原话里的真实细节（气味、天气、那件衣服、那句话），不添加没发生过的情节，不使用"岁月如歌""时光荏苒"这类套语。' +
      '\n情感靠具体的事承载，不靠形容词堆砌。一段故事只写一个场景，写透比写全重要。' +
      '\n直接返回故事正文，不加标题、不加说明、不加 emoji。用中文。',
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
  // ─── 童忆引擎 Agent ──────────────────────────────────
  {
    code: 'memory_story',
    name: 'Memory Story Agent',
    role: '记忆故事',
    description: '整理家庭照片、聊天记录和事件，AI 生成温暖家庭故事。',
    icon: 'BookHeart',
    color: COLORS.highlight,
    status: 'ready',
    level: 3,
    calls: 0,
    systemPrompt:
      '你是岁言的「记忆故事代理」📖，家庭叙事整理者。' +
      '\n你的工作：把零散的家庭照片、聊天记录、事件记录编织成一段温暖短故事。' +
      '\n风格像小时候少儿频道的公益广告：短、温暖、有画面感。不要流水账，不要长篇大论。' +
      '\n保留真实细节（气味、天气、那句话），串联多个瞬间但要有节奏。' +
      '\n最后一句轻轻点题，像公益广告结束时的旁白。' +
      '\n用中文，emoji 最多一个。',
    welcomeMessage: '嗨！我是记忆故事代理 📖 想把家庭照片和回忆变成一段温暖故事？告诉我有哪些瞬间，我帮你编织成一段值得保存的叙事～',
    capabilities: ['故事重构', '记忆串联', '温暖叙事', '时间线整理'],
    skills: [
      {
        name: '家庭故事生成',
        description: '基于照片、聊天记录、事件生成温暖家庭故事',
        icon: 'BookHeart',
        color: COLORS.highlight,
        level: 3,
        status: 'mastered',
        progress: 100,
        category: '童忆',
        tags: ['故事', '家庭', '叙事'],
        examples: ['把春节照片写成故事', '整理这周的家庭事件', '生成一段家庭温暖叙事'],
      },
    ],
  },
  {
    code: 'kindness',
    name: 'Kindness Agent',
    role: '温暖发现',
    description: '自动识别家庭陪伴行为、关心行为和家庭互动，形成 Kindness Node。',
    icon: 'HeartHandshake',
    color: COLORS.success,
    status: 'learning',
    level: 2,
    calls: 0,
    systemPrompt:
      '你是岁言的「温暖发现代理」💛，家庭温暖行为识别专家。' +
      '\n你的工作：从用户的对话、照片描述、事件记录中识别家庭温暖行为。' +
      '\n识别维度：陪伴行为(一起吃饭/旅行/散步)、关心行为(准备早餐/叮嘱添衣)、庆祝时刻(生日/节日)、成长记录(第一次走路/毕业)、情感支持(安慰/鼓励)。' +
      '\n判断重要度：warm(普通温暖)、family(家庭事件)、childhood(童年回忆)、golden(重要瞬间)。' +
      '\n识别到温暖行为后，创建 KindnessMemory 记录，自动进入 Family Memory Graph。' +
      '\n用中文，语气温暖但不鸡汤。',
    welcomeMessage: '嗨！我是温暖发现代理 💛 跟我说说家里最近发生的事，我帮你发现那些值得记录的温暖瞬间～',
    capabilities: ['温暖识别', '行为分析', '情绪标签', '记忆图谱'],
    skills: [
      {
        name: '温暖行为识别',
        description: '从文本中自动识别家庭温暖行为并记录',
        icon: 'HeartHandshake',
        color: COLORS.success,
        level: 2,
        status: 'learning',
        progress: 65,
        category: '童忆',
        tags: ['温暖', '识别', '家庭'],
        examples: ['识别陪伴行为', '发现关心瞬间', '标记家庭互动'],
      },
    ],
  },
  {
    code: 'companion',
    name: 'Companion Agent',
    role: '陪伴提醒',
    description: '像童年公益广告一样，每天提供简短温暖的家庭陪伴提醒。',
    icon: 'Sparkle',
    color: COLORS.rose,
    status: 'running',
    level: 4,
    calls: 0,
    systemPrompt:
      '你是岁言的「陪伴提醒代理」✨，像小时候电视里公益广告一样提供短暂陪伴。' +
      '\n你的工作：根据时间、天气、家庭近况，生成简短的温暖提醒。' +
      '\n要求：1-2 句话，不超过 50 字。温暖但不鸡汤，像朋友随口说的。' +
      '\n晚上提醒聊聊小事，周末提醒陪家人，节日提醒记录。不要感叹号，不要说教。' +
      '\n用中文，像一个关心你的朋友。',
    welcomeMessage: '嗨！我是陪伴提醒代理 ✨ 今天有没有和家人聊聊最近发生的小事？我会每天给你一句小小的温暖提醒～',
    capabilities: ['每日提醒', '陪伴建议', '节日问候', '家庭关怀'],
    skills: [
      {
        name: '温暖提醒',
        description: '生成像公益广告一样的每日温暖陪伴提醒',
        icon: 'Sparkle',
        color: COLORS.rose,
        level: 4,
        status: 'mastered',
        progress: 100,
        category: '童忆',
        tags: ['提醒', '陪伴', '温暖'],
        examples: ['今天的温暖提醒', '周末陪伴建议', '节日家庭问候'],
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
    private readonly quotaService: QuotaService,
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
   * R3-BUG-023: Filter agent calls/status by user — uses AgentExecutionLog
   * for per-user call counts instead of the global calls counter.
   */
  async getAgents(userId?: string) {
    const agents = await this.prisma.agentRuntime.findMany({
      include: { skills: true },
      orderBy: { calls: 'desc' },
    });

    // R3-BUG-023: Compute per-user call counts from execution logs
    let userCallCounts = new Map<string, number>();
    if (userId) {
      const logs = await this.prisma.agentExecutionLog.findMany({
        where: { userId, status: 'success' },
        select: { agentCode: true },
      });
      for (const log of logs) {
        userCallCounts.set(log.agentCode, (userCallCounts.get(log.agentCode) ?? 0) + 1);
      }
    }

    return agents.map((a) => ({
      id: a.code,
      name: a.name,
      role: a.role,
      description: a.description,
      icon: a.icon,
      color: a.color,
      status: a.status,
      level: a.level,
      calls: userId ? (userCallCounts.get(a.code) ?? 0) : a.calls,
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
   * R3-BUG-023: Accept userId to scope skill data by user.
   */
  async getSkills(userId?: string) {
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
    const spamResult = this.spamFilter.filter(message, code, userId);
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

    // R3-BUG-008: Check quota BEFORE incrementing calls counter to avoid
    // incrementing calls on a request that will be rejected due to quota limits.
    const startTime = Date.now();
    let toolResults: AgentToolResult[] = [];
    let status: 'success' | 'failed' = 'success';
    let errorMessage: string | undefined;
    let quotaKey: string | undefined;

    // ===== Pre-check quota (non-destructive) =====
    const preQuotaCheck = await this.quotaService.checkQuota(userId);
    if (!preQuotaCheck.allowed) {
      return {
        success: false,
        agentName: agent.name,
        agentCode: agent.code,
        response: '您的 AI 对话配额已用完，请下月重置或升级订阅计划。',
        tokensUsed: 0,
        model: '',
        toolResults: [],
      };
    }

    // Update agent status to thinking and increment calls
    await this.prisma.agentRuntime.update({
      where: { code },
      data: {
        status: 'thinking',
        lastActiveAt: new Date(),
        calls: { increment: 1 },
      },
    });

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
      const skillPrompt = await this.skillsEvolution.buildSkillPrompt(code, userId);
      // 通用对话准则：只约束「怎么把话说好」，不覆盖各 Agent 的专业人格。
      // 每个 Agent 的语气/身份完全由其自身 systemPrompt 决定（见 AGENT_DEFINITIONS）。
      const conversationGuidelines =
        '\n\n【对话准则】' +
        '\n1. 你是这个领域的专家，先给出真正有用的判断和方案，不要复述用户的话，不要说套话。' +
        '\n2. 保持你自己的身份与语气，不要模仿其他助手，不要使用统一的客服腔。' +
        '\n3. 信息不足时，先给出基于常见情况的可行建议，再补一句最关键的追问，不要连环提问。' +
        '\n4. 长度贴合问题：简单问题 2-4 句说清；需要方案时用 3-5 条要点，每条给具体做法而非原则。' +
        '\n5. 只在真正不确定或涉及安全时说明边界，不要每次都免责。' +
        '\n6. 表情符号最多一个且必须自然，禁止堆叠网络梗和流行语。';

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
        skillPrompt ? '' : conversationGuidelines,
        memoryContext,
        toolContext,
      ]
        .filter(Boolean)
        .join('\n\n');

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      // ===== 配额检查（原子性 check-and-increment）=====
      const quotaCheck = await this.quotaService.checkAndIncrement(userId);
      if (!quotaCheck.allowed) {
        await this.prisma.agentRuntime.update({
          where: { code },
          data: { status: 'idle', calls: { decrement: 1 } },
        });
        return {
          success: false,
          agentName: agent.name,
          agentCode: agent.code,
          response: '您的 AI 对话配额已用完，请下月重置或升级订阅计划。',
          tokensUsed: 0,
          model: '',
          toolResults,
        };
      }
      quotaKey = quotaCheck.quotaKey;

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

      // 回退配额：AI 调用失败时将已扣除的配额返还
      if (quotaKey) {
        try {
          await this.quotaService.decrementUsage(quotaKey);
        } catch (e) {
          this.logger.warn(`Quota rollback failed for ${code}: ${(e as Error).message}`);
        }
      }

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

      // 提供更具诊断性的错误提示
      let diagHint = '请检查 API Key 配置后再试。';
      const lowerErr = errorMessage.toLowerCase();
      if (lowerErr.includes('401') || lowerErr.includes('403')) {
        diagHint = 'API Key 无效或已过期，请在设置页面重新配置 AI 密钥。';
      } else if (lowerErr.includes('400') || lowerErr.includes('model')) {
        diagHint = '模型名称可能不正确，请检查 AI 提供商配置。';
      } else if (lowerErr.includes('timeout') || lowerErr.includes('aborted')) {
        diagHint = '请求超时，AI 服务可能繁忙，请稍后重试。';
      } else if (lowerErr.includes('fetch') || lowerErr.includes('network') || lowerErr.includes('econnrefused')) {
        diagHint = '无法连接到 AI 服务，请检查服务器网络和 API 地址配置。';
      } else if (lowerErr.includes('quota') || lowerErr.includes('rate') || lowerErr.includes('429')) {
        diagHint = 'AI 调用额度已用完或请求过于频繁，请稍后重试。';
      }

      // R2-BE-003: 生产环境下不返回原始错误消息，避免泄露内部信息
      const isProduction = process.env.NODE_ENV === 'production';
      const userFacingMessage = isProduction
        ? `抱歉，我暂时无法响应。${diagHint}`
        : `抱歉，我暂时无法响应。错误信息：${errorMessage}。${diagHint}`;

      return {
        success: false,
        agentName: agent.name,
        agentCode: agent.code,
        response: userFacingMessage,
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
   * R3-BUG-013: Accept userId and verify the user has interacted with the skill's agent.
   */
  async learnSkill(skillId: string, userId?: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: { agent: true },
    });

    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }

    // R3-BUG-013: Verify the user has interacted with this skill's agent
    if (userId && skill.agent) {
      const hasInteraction = await this.prisma.agentExecutionLog.findFirst({
        where: { userId, agentCode: skill.agent.code },
        select: { id: true },
      });
      if (!hasInteraction) {
        throw new ForbiddenException({
          code: ERROR_CODES.FORBIDDEN,
          message: '您尚未使用过该 Agent，无法学习其技能',
        });
      }
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
   * Compute 时墨 (ShiMo) core stats — per-user, from actual activity.
   *
   * AgentRuntime / Skill are global system templates (no userId).
   * Per-user metrics come from AgentExecutionLog, so a brand-new user
   * with zero interactions sees all-zero stats instead of global data.
   *
   * 计算口径（基于用户真实活动）：
   * - understanding：每次成功调用 +2，上限 100（50 次调用 = 满分）
   * - shimoLevel：已交互 Agent 的平均等级 + 交互 Agent 数 * 0.5，上限 20
   * - masteredCount：调用次数 ≥ 5 的 Agent 数量
   */
  private async computeShimoStats(userId: string) {
    const [allAgents, userLogs] = await Promise.all([
      this.prisma.agentRuntime.findMany({
        select: { code: true, status: true, level: true },
      }),
      this.prisma.agentExecutionLog.findMany({
        where: { userId },
        select: { agentCode: true, status: true },
      }),
    ]);

    // 用户实际交互过的 Agent code 集合
    const userAgentCodes = new Set(userLogs.map((l) => l.agentCode));
    // 每个 Agent 的调用次数
    const callCountByCode = new Map<string, number>();
    for (const log of userLogs) {
      callCountByCode.set(
        log.agentCode,
        (callCountByCode.get(log.agentCode) ?? 0) + 1,
      );
    }

    // 只统计用户交互过的 Agent
    const userAgents = allAgents.filter((a) => userAgentCodes.has(a.code));
    const learningAgents = userAgents.filter(
      (a) => a.status === 'learning',
    ).length;
    const activeAgents = userAgents.filter(
      (a) => a.status === 'running' || a.status === 'thinking',
    ).length;

    // 掌握的技能 = 调用次数 ≥ 5 的 Agent
    const masteredCount = userAgents.filter(
      (a) => (callCountByCode.get(a.code) ?? 0) >= 5,
    ).length;

    const successCalls = userLogs.filter((l) => l.status === 'success').length;
    const avgSkillLevel =
      userAgents.length > 0
        ? Math.round(
            userAgents.reduce((sum, a) => sum + a.level, 0) / userAgents.length,
          )
        : 0;

    // 理解程度：基于用户真实交互次数
    const understanding = Math.round(Math.min(100, successCalls * 2));

    // 时墨等级 = 已交互 Agent 平均等级 + 交互 Agent 数 * 0.5
    const shimoLevel = Math.min(
      20,
      Math.floor(avgSkillLevel + userAgents.length * 0.5),
    );

    return {
      agentCount: userAgents.length,
      learningAgents,
      activeAgents,
      masteredCount,
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
      await this.computeShimoStats(userId);

    const [userCallCount, treeStats, kindnessCount, warmReminderCount, shortStoryCount] = await Promise.all([
      this.prisma.agentExecutionLog.count({
        where: { userId, status: 'success' },
      }),
      this.lifeTreeService.getTreeGrowthStats(userId),
      // 童忆引擎 metrics
      this.prisma.kindnessMemory.count({
        where: { userId, isDeleted: false },
      }),
      this.prisma.warmReminder.count({
        where: { userId, status: 'delivered' },
      }),
      this.prisma.familyShortStory.count({
        where: { userId },
      }),
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
      totalAgentCalls: userCallCount,
      timeCapsules: treeStats.timeCapsuleCount,
      milestones: treeStats.milestoneCount,
      stories: treeStats.storyCount,
      interviews: treeStats.interviewCount,
      // 童忆引擎指标
      kindnessMemories: kindnessCount,
      warmReminders: warmReminderCount,
      familyStories: shortStoryCount,
    };
  }

  /**
   * Get ShiMo Core status.
   */
  async getShimoCore(userId: string) {
    const { agentCount, learningAgents, activeAgents, understanding, shimoLevel } =
      await this.computeShimoStats(userId);

    // 最近学习内容：从用户最近的执行日志中取
    const recentLogs = await this.prisma.agentExecutionLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { agentCode: true },
    });
    const agentCodeToName = new Map(
      (await this.prisma.agentRuntime.findMany({
        select: { code: true, name: true },
      })).map((a) => [a.code, a.name]),
    );
    const recentLearning = recentLogs
      .map((l) => agentCodeToName.get(l.agentCode))
      .filter((n): n is string => !!n);

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
  async getTimeline(userId: string) {
    // 从用户自己的执行日志中生成时间线
    const recentLogs = await this.prisma.agentExecutionLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        agentCode: true,
        message: true,
        status: true,
        createdAt: true,
      },
    });

    const agentCodeToName = new Map(
      (await this.prisma.agentRuntime.findMany({
        select: { code: true, name: true, role: true },
      })).map((a) => [a.code, { name: a.name, role: a.role }]),
    );

    const timeline: Array<{
      id: string;
      date: string;
      title: string;
      detail: string;
      type: string;
    }> = [];

    for (const log of recentLogs) {
      const agentInfo = agentCodeToName.get(log.agentCode);
      const agentName = agentInfo?.name ?? log.agentCode;
      const agentRole = agentInfo?.role ?? '';
      timeline.push({
        id: `log-${log.id}`,
        date: log.createdAt.toISOString().slice(5, 10).replace('-', '-'),
        title: `${agentName} 对话`,
        detail: `${agentRole} · ${log.status === 'success' ? '成功' : '失败'} · ${log.message.slice(0, 30)}`,
        type: 'agent',
      });
    }

    return timeline;
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
