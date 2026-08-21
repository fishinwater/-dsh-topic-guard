/**
 * dsh-topic-guard v0.2.0 — Topic-Aware Workspace Memory for DeepSeek Harness.
 *
 * 三层架构（规格 §3）：
 * - 数据层 memory/：.harness/topics/ 布局（topic.json + summary.md + artifacts/），
 *   默认根 ~/.dsh/topics/（config rootDir 可覆盖为项目目录以便 Git 提交）。
 * - 控制层 manager/：Drift Detector（规则级投影 fold）+ Router（/t 命令族）+ Attributor。
 * - 交互层 client/：非阻塞 Inline Chip（客户端 bundle，conversation.input.dock 槽位）。
 *
 * 桥接：漂移建议通过会话投影单元（key 'topic-guard'）实时推给客户端（session/projection 帧，
 * 永不落盘、断线重连由宿主重算）；chip 的 [新建]/[忽略] 通过 /t new|ignore 命令回传（command/run
 * 事件同时驱动 fold 清除建议）。
 */
import { Service } from '@deepseek-ai/cordis';
export declare const name = "topic-guard";
export declare class TopicGuard extends Service {
    static inject: string[];
    static Config: any;
    private config;
    private readonly store;
    private readonly router;
    constructor(ctx: any, config?: Record<string, unknown>);
    /**
     * 会话投影单元：Drift Detector 作为纯 fold 运行，建议经 session/projection 帧
     * 实时推给浏览器端 chip（key 'topic-guard'）。
     */
    private registerProjection;
    /** 注册 /t 命令族。 */
    private registerCommands;
    /** 兼容旧版：/topic <标题> 直接重命名会话标题（不弹窗）。 */
    private registerTopicCompatCommand;
}
export default TopicGuard;
