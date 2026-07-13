// exam-bootstrap — 시험 IDE(code-server) 최초 진입 UX 보정.
//
// 왜 필요한가(근거: 슬롯 IDE 서브도메인 전환 커밋 7c98985의 후속):
//  code-server 는 확장 webview(Claude Code 사이드바 = claudeVSCodeSidebarSecondary)를
//  중첩 iframe + service worker 로 렌더한다. 그런데 갓 등록된 SW 는 "자기를 등록한 첫
//  페이지 로드"를 즉시 제어하지 못한다(activate→clients.claim 이전). Claude 확장은
//  onStartupFinished 에 곧바로 webview 를 그리므로, 첫 콜드 로드에서는 SW 미claim 상태에
//  렌더돼 "빈 화면"이 된다. 학생이 사이드바를 접었다 펴면(=webview 재생성) SW 가 이미
//  활성이라 정상 렌더된다 — 이 확장은 그 수동 우회를 자동화한다.
//
// 겸사겸사, VS Code 에는 "탐색기 전체 펼침" 설정이 없어 시작 시 list.expandAll 명령을 쏜다.

const vscode = require('vscode');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function expandExplorer() {
  // 탐색기 포커스 후 전체 펼침. 트리 자식 로드에 여유를 주고, 깊은 트리 대비 2회 시도.
  try {
    await vscode.commands.executeCommand('workbench.view.explorer');
    await sleep(600);
    await vscode.commands.executeCommand('list.expandAll');
    await sleep(400);
    await vscode.commands.executeCommand('list.expandAll');
  } catch {
    /* 명령 부재/실패는 조용히 무시 — UX 보정일 뿐 시험 진행을 막지 않는다 */
  }
}

async function reviveClaudePanel() {
  // 보조 사이드바(우측)를 접었다 펴서 Claude webview 를 재생성한다.
  // retainContextWhenHidden 기본값(false) 기준 hide→show 시 webview 가 새로 만들어지고,
  // 이때는 SW 가 활성이라 정상 렌더된다.
  try {
    // closeAuxiliaryBar 는 현재 보임 상태와 무관하게 항상 "닫힘"으로 만든다(idempotent) →
    // 이어지는 focus 가 무조건 새로 열며 webview 를 재생성한다(toggle 은 초기 상태에 따라 결과가 갈림).
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar'); // 닫기
    await sleep(300);
    await vscode.commands.executeCommand('claudeVSCodeSidebarSecondary.focus');  // 열며 재생성
  } catch {
    // 보조 사이드바 미지원 등 폴백: 기본(주) 사이드바 뷰 포커스
    try {
      await vscode.commands.executeCommand('claudeVSCodeSidebar.focus');
    } catch {
      /* 뷰 id 변동 시에도 실패는 무시 */
    }
  }
}

function activate() {
  // 워크벤치 렌더·SW 활성화에 여유를 준 뒤 실행(학생 수동 조작 타이밍과 유사).
  void (async () => {
    await sleep(2000);
    await expandExplorer();
    await reviveClaudePanel();
  })();
}

function deactivate() {}

module.exports = { activate, deactivate };
