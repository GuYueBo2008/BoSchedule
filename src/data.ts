import type { AppData, EventColor, RepeatType, ScheduleEvent } from './types';

const createdAt = '2026-08-25T08:00:00.000Z';

function demoEvent(
  id: string,
  title: string,
  day: number,
  start: string,
  end: string,
  location: string,
  tags: string[],
  color: EventColor,
  detail: string,
  options: Partial<Pick<ScheduleEvent, 'timetableId' | 'repeat' | 'startWeek' | 'endWeek'>> = {},
): ScheduleEvent {
  return {
    id,
    title,
    detail,
    day,
    start,
    end,
    location,
    tags,
    color,
    images: [],
    repeat: options.repeat || 'weekly',
    startWeek: options.startWeek || 1,
    endWeek: options.endWeek || 16,
    timetableId: options.timetableId || 'term-2026-autumn',
    createdAt,
    updatedAt: createdAt,
  };
}

export function createInitialData(): AppData {
  return {
    version: 1,
    activeTimetableId: 'term-2026-autumn',
    timetables: [
      { id: 'term-2026-autumn', name: '2026 秋季学期', termStart: '2026-08-31', createdAt, updatedAt: createdAt },
      { id: 'product-internship', name: '产品实习', termStart: '2026-08-31', createdAt, updatedAt: createdAt },
    ],
    tags: [
      { id: 'tag-course', name: '课程', color: '#39745c' },
      { id: 'tag-meeting', name: '会议', color: '#496e9f' },
      { id: 'tag-activity', name: '活动', color: '#b37731' },
      { id: 'tag-personal', name: '个人', color: '#806695' },
    ],
    events: [
      demoEvent('evt-math', '高等数学', 0, '08:00', '09:40', '理科楼 A203', ['课程'], 'sage', '第六章：多元函数微分学。请提前完成课后习题 3、5、8，携带习题册。'),
      demoEvent('evt-psychology', '设计心理学', 1 - 1, '10:10', '11:50', '教一 102', ['课程'], 'lavender', '本讲主题：情感化设计。阅读《设计心理学 3》第二章。', { endWeek: 12 }),
      demoEvent('evt-standup', '产品例会', 0, '14:00', '15:00', '创新工坊 · 2F', ['会议'], 'blue', '同步本周项目进度，确认可用性测试名单与下次评审时间。'),
      demoEvent('evt-data-structure', '数据结构', 1, '08:00', '09:40', '计算中心 301', ['课程'], 'cyan', '树与二叉树。实验课需要携带电脑，提前配置好开发环境。'),
      demoEvent('evt-swim', '游泳训练', 1, '18:30', '20:00', '校体育馆', ['个人'], 'amber', '自由泳耐力训练，记得携带泳镜、毛巾和校园卡。', { startWeek: 2 }),
      demoEvent('evt-hci', '人机交互', 2, '10:10', '11:50', '设计楼 206', ['课程'], 'lavender', '交互原型评估： Nielsen 十大可用性原则。'),
      demoEvent('evt-workshop', '项目工作坊', 2, '14:00', '16:00', '创新工坊 · 1F', ['活动'], 'rose', '分组完成服务蓝图，15:40 开始阶段汇报。', { repeat: 'odd', endWeek: 15 }),
      demoEvent('evt-english', '英语视听说', 3, '08:00', '09:40', '文科楼 305', ['课程'], 'blue', 'Unit 6: Cross-cultural communication. Prepare a two-minute talk.'),
      demoEvent('evt-basketball', '篮球社训练', 3, '18:00', '20:00', '东区运动场', ['活动'], 'amber', '全场对抗训练，提前十分钟到场热身。', { repeat: 'even', startWeek: 2 }),
      demoEvent('evt-os', '操作系统', 4, '10:10', '11:50', '计算中心 302', ['课程'], 'cyan', '内存管理与页面置换算法。课后完成 Lab 4。'),
      demoEvent('evt-market', '周末创意市集', 5, '15:00', '18:00', '大学生活动中心', ['活动'], 'rose', '校园创意品牌摊位与独立音乐演出，从东门入场。', { repeat: 'once', startWeek: 9, endWeek: 9 }),
      demoEvent('evt-review', '一周复盘', 6, '20:00', '21:00', '我的书桌', ['个人'], 'lavender', '整理本周笔记，写下三个收获与下周最重要的一件事。'),
      demoEvent('evt-review-meeting', '需求评审', 1, '14:00', '15:30', '线上 · 腾讯会议', ['会议'], 'blue', '评审 V1.4 需求清单与边界情况。', { timetableId: 'product-internship' }),
      demoEvent('evt-design-walk', '设计走查', 3, '16:00', '17:00', '3F 产品区', ['会议'], 'lavender', '检查核心流程的视觉还原与交互状态。', { timetableId: 'product-internship' }),
      demoEvent('evt-team-lunch', '团队午餐', 4, '12:00', '13:30', '南门小馆', ['个人'], 'amber', '每月一次的团队聚餐。', { timetableId: 'product-internship', repeat: 'once', startWeek: 9, endWeek: 9 }),
    ],
    devices: [],
    eventTombstones: {},
    history: [
      { id: 'history-1', action: '更新', summary: '调整了「高等数学」的上课地点', timestamp: '2026-10-25T12:30:00.000Z' },
      { id: 'history-2', action: '创建', summary: '新建日程「周末创意市集」', timestamp: '2026-10-24T09:20:00.000Z' },
      { id: 'history-3', action: '导入', summary: '从课表文字导入 8 项日程', timestamp: '2026-10-22T02:15:00.000Z' },
    ],
    settings: { theme: 'light', apiKey: '', autoSync: true, retryInterval: 15, retryCount: 30 },
  };
}
