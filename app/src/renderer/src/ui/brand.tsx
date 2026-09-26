import aws from '../assets/brands/aws.png'
import azure from '../assets/brands/azure.png'
import gcloud from '../assets/brands/gcloud.png'
import gitlab from '../assets/brands/gitlab.png'
import bitbucket from '../assets/brands/bitbucket.png'
import jira from '../assets/brands/jira.png'
import linear from '../assets/brands/linear.png'
import sentry from '../assets/brands/sentry.png'
import groqPng from '../assets/brands/groq.png'
import chatgpt from '../assets/brands/chatgpt.png'
import lmstudio from '../assets/brands/lmstudio.png'
import deepseek from '../assets/brands/deepseek-color.svg?raw'
import qwen from '../assets/brands/qwen-color.svg?raw'
import anthropic from '../assets/brands/anthropic.svg?raw'
import ollama from '../assets/brands/ollama.svg?raw'

const png: Record<string, string> = { aws, azure, gcloud, gitlab, bitbucket, jira, linear, sentry, groq: groqPng, openai: chatgpt, lmstudio }
const svg: Record<string, string> = { deepseek, qwen, anthropic, ollama }

/** Brand mark on a white tile (white is a Sakai brand color, and keeps dark wordmarks legible on the dark UI). */
export function BrandTile({ id: rawId, size = 36 }: { id: string; size?: number }) {
  const id = rawId === 'qwen-cn' ? 'qwen' : rawId
  const inner = Math.round(size * 0.62)
  return (
    <span className="grid place-items-center rounded-lg bg-white shrink-0" style={{ width: size, height: size }}>
      {png[id] ? <img src={png[id]} width={inner} height={inner} alt="" draggable={false} />
        : svg[id] ? <span className="text-black grid place-items-center [&_svg]:w-full [&_svg]:h-full" style={{ width: inner, height: inner }} dangerouslySetInnerHTML={{ __html: svg[id] }} />
        : <span className="text-black text-xs font-bold">{id.slice(0, 2).toUpperCase()}</span>}
    </span>
  )
}

export const GithubMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
)
