'use client';

import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import './torisetsu.css'; // ★ 共通CSSをインポート

export default function TorisetsuIndexClient() {
  return (
    <>
      <nav className="t-nav">
        <div className="t-nav-inner">
          <BrandLogo />
        </div>
      </nav>

      <main className="t-main">
        <div className="t-hero">
          <span className="t-badge">User Manual</span>
          <h1>Push-taro 初詣 取扱説明書</h1>
          <p>神社の初詣向け Push-taro 初詣 の操作を解説します。</p>
        </div>

        <div className="t-plan-grid">
          <Link href="/torisetsu/event" className="t-plan-card">
            <div className="t-plan-icon">🎪</div>
            <div className="t-plan-name">Push-taro 初詣</div>
            <div className="t-plan-desc">神社の初詣向け</div>
            <ul className="t-plan-list">
              <li>データのリセット方式A / B / Cの違い</li>
              <li>12月31日の前倒しリセットと年始プッシュ</li>
              <li>イベント終了時の消去手順</li>
              <li>消去前に届く集計レポート</li>
              <li>消込の権限について</li>
            </ul>
            <span className="t-plan-btn">取扱説明書を見る →</span>
          </Link>
        </div>
      </main>
    </>
  );
}
