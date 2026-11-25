export function npmNodeShim(relativeScript) {
  return [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    "",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
    "  SET PATHEXT=%PATHEXT:;.JS;=;%",
    ")",
    "",
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${relativeScript}" %*`,
    ""
  ].join("\r\n");
}

export function npmExeShim(relativeExe) {
  return [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    `"%dp0%\\${relativeExe}"   %*`,
    ""
  ].join("\r\n");
}

export const intactArguments = [
  "plain words",
  "a & b",
  "a | b",
  "a < b > c",
  "caret ^ x",
  "%PATH%",
  "100% sure",
  "100%",
  "%",
  "%%",
  "x:y",
  "at 10:30",
  "C:\\dir\\file",
  "!PATH!",
  "wow!",
  'say "hi" there',
  'quote " and & % !',
  'tail\\"',
  "tail\\",
  "tail\\\\",
  'a\\\\"b',
  "(parens) [x]",
  "tab\there",
  "",
  "café 한글 🙂",
  "-p",
  "/c",
  '" & word & "',
  '\\" & word & \\"',
  '"&word&rem ',
  "& word",
  "x&word",
  "%COMSPEC% /c word",
  'a "b" & word',
  "%OS:W=w%",
  "%OS:W=%",
  "%OS:*W=x%",
  "a %OS:W=w% b %OS% c",
  "%OS:~1%",
  "%OS:~0,3%",
  "%OS:%"
];

export const shimOnlyArguments = ["line1\nline2", "x".repeat(9000)];
