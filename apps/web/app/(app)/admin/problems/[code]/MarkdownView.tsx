import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// 마크다운 미리보기(admin 검수). react-markdown + GFM(표·체크박스·취소선)을 디자인 토큰으로 매핑.
// 순수 변환이라 서버 컴포넌트로 렌더한다(브라우저 API 없음). 학생 경로와 무관한 검수 전용.

const components: Components = {
  h1: ({ children }) => <h1 className="cds-heading-05 text-text-primary mt-06 mb-03 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="cds-heading-04 text-text-primary mt-05 mb-03 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="cds-heading-03 text-text-primary mt-05 mb-02">{children}</h3>,
  h4: ({ children }) => <h4 className="cds-heading-02 text-text-primary mt-04 mb-02">{children}</h4>,
  p: ({ children }) => <p className="cds-body-01 text-text-primary my-03 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-06 my-03 cds-body-01 text-text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-06 my-03 cds-body-01 text-text-primary">{children}</ol>,
  li: ({ children }) => <li className="my-01">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-link-primary underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-600 text-text-primary">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-strong-01 pl-04 my-03 text-text-secondary">{children}</blockquote>
  ),
  hr: () => <hr className="border-border-subtle-01 my-05" />,
  pre: ({ children }) => (
    <pre className="bg-layer-01 border border-border-subtle-01 p-04 my-03 overflow-x-auto cds-code-01 text-text-primary">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '');
    if (isBlock) return <code className="cds-code-01">{children}</code>;
    return <code className="cds-code-01 bg-layer-01 px-01 text-text-primary">{children}</code>;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-03">
      <table className="w-full border-collapse cds-code-01">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border-subtle-01 bg-layer-01 px-03 py-02 text-left text-text-primary">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border-subtle-01 px-03 py-02 text-text-primary">{children}</td>,
  img: ({ src, alt }) => <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} className="max-w-full my-03" />,
};

export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="px-05 py-04">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
