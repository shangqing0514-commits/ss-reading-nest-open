import { useMemo, useState } from "react";
import type { SessionBundle, SourceAvailability } from "@ss/shared";

export type BookshelfItem = SessionBundle & {
  sourceAvailability: SourceAvailability;
  latestComment?: string;
};

type Filter = "all" | "active" | "completed" | "missing" | "novel" | "manga";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "阅读中" },
  { value: "completed", label: "已完成" },
  { value: "missing", label: "正文缺失" },
  { value: "novel", label: "小说" },
  { value: "manga", label: "漫画" }
];

const MODE_LABELS = {
  light_chat: "轻松聊聊",
  reaction_only: "吐槽一下",
  cp_talk: "嗑一下",
  plot_guess: "猜后续",
  deep_analysis: "认真分析",
  diary_summary: "读书日记"
} as const;

export function Home(props: {
  bookshelf: BookshelfItem[];
  onNew: (type: "novel" | "manga") => void;
  onOpen: (item: BookshelfItem) => void;
  onReimport: (item: BookshelfItem) => void;
  onManage: (item: BookshelfItem) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(
    () =>
      props.bookshelf.filter((item) => {
        if (filter === "active" || filter === "completed") {
          return item.session.status === filter;
        }
        if (filter === "missing") {
          return [
            "cloud_missing",
            "cloud_restore_failed",
            "local_only_missing"
          ].includes(item.sourceAvailability);
        }
        if (filter === "novel" || filter === "manga") {
          return item.session.type === filter;
        }
        return true;
      }),
    [filter, props.bookshelf]
  );

  return (
    <main className="home-shell">
      <section className="home-hero">
        <div className="nest-mark">S×S</div>
        <h1>S×S 小窝共读</h1>
        <p>晚上好，今天想一起看什么？</p>
      </section>

      <section className="mode-grid" aria-label="共读模式">
        <button className="mode-card novel-card" onClick={() => props.onNew("novel")}>
          <span className="mode-icon">📖</span>
          <span><strong>小说共读</strong><small>贴进文字，慢慢读</small></span>
          <span>›</span>
        </button>
        <button className="mode-card manga-card" onClick={() => props.onNew("manga")}>
          <span className="mode-icon">🖼️</span>
          <span><strong>漫画共读</strong><small>导入图片，一页页看</small></span>
          <span>›</span>
        </button>
      </section>

      <section className="bookshelf-section">
        <div className="section-heading">
          <h2>我的书架</h2>
          <span>{props.bookshelf.length} 本作品</span>
        </div>
        <div className="bookshelf-filters" aria-label="书架筛选">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {props.bookshelf.length === 0 ? (
          <div className="empty-nest">小窝还是空的。选一本故事，我们一起开始吧。</div>
        ) : visible.length === 0 ? (
          <div className="empty-nest">这个筛选下还没有作品。</div>
        ) : (
          <div className="bookshelf-grid">
            {visible.map((item) => (
              <BookCard
                key={item.session.id}
                item={item}
                onOpen={props.onOpen}
                onReimport={props.onReimport}
                onManage={props.onManage}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BookCard(props: {
  item: BookshelfItem;
  onOpen: (item: BookshelfItem) => void;
  onReimport: (item: BookshelfItem) => void;
  onManage: (item: BookshelfItem) => void;
}) {
  const { item } = props;
  const available = item.sourceAvailability === "available_local";
  const action = sourceAction(item);
  return (
    <article className="book-card">
      <div className="book-card-top">
        <span className={`book-spine ${item.session.type}`}>
          {item.session.type === "novel" ? "书" : "画"}
        </span>
        <div className="book-title">
          <strong>{item.session.title}</strong>
          <span>
            {item.session.type === "novel" ? "小说" : "漫画"} ·{" "}
            {item.session.status === "active" ? "阅读中" : "已完成"}
          </span>
        </div>
        <span className={`status-dot ${item.session.status}`}>
          {item.session.status === "active" ? "阅读中" : "已完成"}
        </span>
      </div>
      <div className="book-progress">
        <span>用户：{item.session.userCurrentPosition.label}</span>
        <span>烁构：{item.session.assistantSyncedPosition?.label ?? "尚未同步"}</span>
        <span>{MODE_LABELS[item.session.sessionPreferences.readingCommentMode]}</span>
      </div>
      <div className={`book-source ${item.sourceAvailability}`}>
        <strong>{action.status}</strong>
        <span>{action.hint}</span>
      </div>
      <p className="book-comment">
        {item.latestComment ? `烁构：${item.latestComment}` : "烁构还没留下短评。"}
      </p>
      <button
        type="button"
        className={available ? "action-primary book-action" : "book-action"}
        aria-label={`${action.button}《${item.session.title}》`}
        onClick={() => (available ? props.onOpen(item) : props.onReimport(item))}
      >
        {action.button}
      </button>
      <button
        type="button"
        className="text-button book-manage-button"
        aria-label={`管理《${item.session.title}》`}
        onClick={() => props.onManage(item)}
      >
        管理这本书
      </button>
    </article>
  );
}

function sourceAction(item: BookshelfItem) {
  if (item.sourceAvailability === "available_local") {
    return {
      status: "当前设备可读",
      hint: "正文或漫画缓存与这本作品一致。",
      button: "继续阅读"
    };
  }
  if (item.sourceAvailability === "available_cloud") {
    return {
      status: "云端可恢复",
      hint: "当前设备缺少正文，但私人云端有可恢复副本。",
      button: "恢复正文"
    };
  }
  if (item.sourceAvailability === "restoring_from_cloud") {
    return {
      status: "正在从私人云端恢复正文",
      hint: "恢复完成后就可以继续阅读。",
      button: "恢复中"
    };
  }
  if (item.sourceAvailability === "cloud_restore_failed") {
    return {
      status: "恢复失败，请重新导入",
      hint: "进度和评论仍在，重新导入同一份正文后可继续。",
      button: item.session.type === "novel" ? "重新导入正文" : "重新导入漫画"
    };
  }
  if (item.sourceAvailability === "cloud_missing") {
    return {
      status: "云端正文不可用",
      hint: "私人云端副本没有找到，请重新导入后同步。",
      button: item.session.type === "novel" ? "重新导入正文" : "重新导入漫画"
    };
  }
  if (item.sourceAvailability === "local_only_missing") {
    return {
      status:
        item.session.type === "novel"
          ? "当前设备缺少正文"
          : "当前设备缺少漫画图片",
      hint:
        item.session.type === "novel"
          ? "重新导入后同步到私人云端。"
          : "请重新导入同一套漫画图片。",
      button: item.session.type === "novel" ? "重新导入正文" : "重新导入漫画"
    };
  }
  if (item.sourceAvailability === "mismatch") {
    return {
      status: "正文版本不一致",
      hint: "当前版本可能导致位置错位，不会自动补课。",
      button: "重新导入正确版本"
    };
  }
  if (item.sourceAvailability === "segmentation_mismatch") {
    return {
      status: "分段版本不一致",
      hint: "请重新导入或重新分段后继续。",
      button: "重新分段"
    };
  }
  return {
    status: "正在检查正文状态",
    hint: "需要导入或验证当前设备上的内容。",
    button: "验证正文"
  };
}
