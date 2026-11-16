using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace StroopMiniGame
{
    /// <summary>
    /// 스트룹 미니게임 본체.
    /// 빈 GameObject에 이 컴포넌트 하나만 붙이고 Play 하면 UI까지 전부 자동 생성됩니다.
    /// </summary>
    public class StroopGame : MonoBehaviour
    {
        private enum State { Title, Countdown, Playing, Result }

        [Header("규칙")]
        [SerializeField] private float roundDuration = 45f;
        [SerializeField] private float wrongPenaltySeconds = 1f;
        [SerializeField] private int correctPerLevel = 5;
        [SerializeField] private float feedbackDelay = 0.18f;

        [Header("표시")]
        [Tooltip("한글 폰트(.ttf)를 넣어주세요. 비워두면 기본 폰트 + OS 폰트로 대체합니다.")]
        [SerializeField] private Font font;

        [SerializeField]
        private List<StroopColor> palette = new List<StroopColor>
        {
            new StroopColor("빨강", Hex("#E53935")),
            new StroopColor("파랑", Hex("#1E63D6")),
            new StroopColor("초록", Hex("#2E9E44")),
            new StroopColor("노랑", Hex("#F2B705")),
        };

        private const string BestScoreKey = "StroopGame.BestScore";

        // 테마
        private static readonly Color BgColor = Hex("#F3F0E8");
        private static readonly Color TextDark = Hex("#2B2B2B");
        private static readonly Color TextSub = Hex("#4F4A43");
        private static readonly Color CardColor = Color.white;
        private static readonly Color InkBadge = Hex("#2B2B2B");
        private static readonly Color MeaningBadge = Hex("#E8682B");
        private static readonly Color GoodColor = Hex("#2E9E44");
        private static readonly Color BadColor = Hex("#E53935");
        private static readonly Color AnswerBarColor = Hex("#2B2B2B");
        private static readonly Color Accent = Hex("#D9581E");

        // 런타임 상태
        private State state;
        private readonly StroopGenerator generator = new StroopGenerator();
        private StroopQuestion question;
        private float timeLeft;
        private float questionShownAt;
        private bool inputLocked;
        private int score, combo, maxCombo, correct, wrong, level;
        private float reactionSum;
        private int bestScore;

        // UI 참조
        private RectTransform titlePanel, gamePanel, resultPanel;
        private RectTransform timeFill, wordCard;
        private Image timeFillImage;
        private RectTransform answerFill;
        private Image answerFillImage;
        private float answerTimeLimit;
        private Text scoreText;
        private Image instructionBadge;
        private Text instructionText, wordText, countdownText, feedbackText;
        private Text resultScoreText, resultBestText, resultDetailText, titleBestText, cheerText;
        private readonly Button[] optionButtons = new Button[StroopGenerator.OptionCount];
        private readonly Text[] optionLabels = new Text[StroopGenerator.OptionCount];
        private Coroutine cardAnim, feedbackAnim;

        // ───────────────────────── 라이프사이클 ─────────────────────────

        private void Awake()
        {
            if (palette == null || palette.Count < 4)
            {
                Debug.LogWarning("[StroopGame] 팔레트는 최소 4색이 필요합니다. 기본 팔레트를 사용합니다.");
                palette = new List<StroopColor>
                {
                    new StroopColor("빨강", Hex("#E53935")), new StroopColor("파랑", Hex("#1E63D6")),
                    new StroopColor("초록", Hex("#2E9E44")), new StroopColor("노랑", Hex("#F2B705")),
                };
            }
            if (font == null) font = StroopUIFactory.LoadDefaultFont();

            bestScore = PlayerPrefs.GetInt(BestScoreKey, 0);
            BuildUI();
            ShowTitle();
        }

        private void Update()
        {
            if (state != State.Playing) return;

            timeLeft -= Time.deltaTime;
            if (timeLeft <= 0f)
            {
                timeLeft = 0f;
                UpdateHud();
                EndGame();
                return;
            }

            // 문제당 제한 시간
            if (!inputLocked && question != null)
            {
                float elapsed = Time.time - questionShownAt;
                float remain = answerTimeLimit > 0f ? Mathf.Clamp01(1f - elapsed / answerTimeLimit) : 0f;
                answerFill.anchorMax = new Vector2(remain, 1f);
                answerFillImage.color = remain > 0.3f ? AnswerBarColor : BadColor;
                if (elapsed >= answerTimeLimit) Resolve(false, elapsed);
            }
            UpdateHud();
        }

        // ───────────────────────── 흐름 ─────────────────────────

        private void ShowTitle()
        {
            state = State.Title;
            titlePanel.gameObject.SetActive(true);
            gamePanel.gameObject.SetActive(false);
            resultPanel.gameObject.SetActive(false);
            titleBestText.text = bestScore > 0 ? $"최고 점수 {bestScore:N0}" : "";
        }

        public void StartGame()
        {
            StopAllCoroutines();
            cardAnim = feedbackAnim = null;

            score = combo = maxCombo = correct = wrong = 0;
            reactionSum = 0f;
            level = 1;
            timeLeft = roundDuration;
            generator.Reset();

            titlePanel.gameObject.SetActive(false);
            resultPanel.gameObject.SetActive(false);
            gamePanel.gameObject.SetActive(true);
            feedbackText.text = "";
            wordText.text = "";
            instructionBadge.gameObject.SetActive(false);
            SetOptionsVisible(false);
            UpdateHud();

            StartCoroutine(CountdownRoutine());
        }

        private IEnumerator CountdownRoutine()
        {
            state = State.Countdown;
            countdownText.gameObject.SetActive(true);
            for (int i = 3; i >= 1; i--)
            {
                countdownText.text = i.ToString();
                yield return Punch(countdownText.rectTransform, 1.4f, 0.25f);
                yield return new WaitForSeconds(0.5f);
            }
            countdownText.gameObject.SetActive(false);

            state = State.Playing;
            instructionBadge.gameObject.SetActive(true);
            SetOptionsVisible(true);
            NextQuestion();
        }

        private void NextQuestion()
        {
            question = generator.Next(level, palette.Count);

            answerTimeLimit = LevelSettings.For(level, palette.Count).answerTimeLimit;
            answerFill.anchorMax = Vector2.one;
            answerFillImage.color = AnswerBarColor;

            // 단어
            wordText.text = palette[question.wordIndex].name;
            wordText.color = palette[question.inkIndex].color;

            // 보기
            for (int i = 0; i < optionButtons.Length; i++)
            {
                bool used = i < question.options.Length;
                optionButtons[i].gameObject.SetActive(used);
                if (!used) continue;

                optionLabels[i].text = palette[question.options[i]].name;
                int labelInk = question.optionLabelInk[i];
                optionLabels[i].color = labelInk >= 0 ? palette[labelInk].color : TextDark;
                optionButtons[i].interactable = true;
            }

            if (cardAnim != null) StopCoroutine(cardAnim);
            cardAnim = StartCoroutine(Punch(wordCard, 1.06f, 0.12f));

            questionShownAt = Time.time;
            inputLocked = false;
        }

        private void OnOptionClicked(int buttonIndex)
        {
            if (state != State.Playing || inputLocked || question == null) return;
            if (buttonIndex >= question.options.Length) return;
            Resolve(question.options[buttonIndex] == question.answerIndex, Time.time - questionShownAt);
        }

        /// <summary>정답/오답/시간 초과 처리</summary>
        private void Resolve(bool isCorrect, float rt)
        {
            inputLocked = true;

            if (isCorrect)
            {
                correct++;
                combo++;
                maxCombo = Mathf.Max(maxCombo, combo);
                reactionSum += rt;
                score += StroopScoring.ForCorrect(combo, rt);
                level = Mathf.Min(LevelSettings.MaxLevel, 1 + correct / Mathf.Max(1, correctPerLevel));
                ShowFeedback(true);
            }
            else
            {
                wrong++;
                combo = 0;
                timeLeft = Mathf.Max(0.01f, timeLeft - wrongPenaltySeconds);
                ShowFeedback(false);
                if (cardAnim != null) StopCoroutine(cardAnim);
                cardAnim = StartCoroutine(Shake(wordCard, 0.25f, 22f));
            }

            UpdateHud();
            StartCoroutine(AdvanceAfter(feedbackDelay));
        }

        private IEnumerator AdvanceAfter(float delay)
        {
            yield return new WaitForSeconds(delay);
            if (state == State.Playing) NextQuestion();
        }

        private void EndGame()
        {
            state = State.Result;
            inputLocked = true;
            StopAllCoroutines();
            cardAnim = feedbackAnim = null;
            wordCard.localScale = Vector3.one;
            wordCard.anchoredPosition = Vector2.zero;

            bool newBest = score > bestScore;
            if (newBest)
            {
                bestScore = score;
                PlayerPrefs.SetInt(BestScoreKey, bestScore);
                PlayerPrefs.Save();
            }

            int total = correct + wrong;
            float accuracy = total > 0 ? (float)correct / total * 100f : 0f;
            float avgRt = correct > 0 ? reactionSum / correct : 0f;

            cheerText.text = accuracy >= 90f ? "아주 잘하셨어요!" : accuracy >= 70f ? "잘하셨어요!" : "꾸준히 하면 좋아져요!";
            resultScoreText.text = $"{score:N0}";
            resultBestText.text = newBest && score > 0
                ? $"<color={StroopUIFactory.ToHex(Accent)}>최고 점수 달성!</color>"
                : $"최고 점수 {bestScore:N0}";
            resultDetailText.text =
                $"맞힌 문제   <b>{correct}개</b>\n" +
                $"정확도   <b>{accuracy:0}%</b>\n" +
                $"평균 속도   <b>{(correct > 0 ? avgRt.ToString("0.0") + "초" : "-")}</b>";

            gamePanel.gameObject.SetActive(false);
            resultPanel.gameObject.SetActive(true);
            StartCoroutine(Punch(resultScoreText.rectTransform, 1.25f, 0.3f));
        }

        // ───────────────────────── HUD / 연출 ─────────────────────────

        private void UpdateHud()
        {
            float ratio = roundDuration > 0f ? Mathf.Clamp01(timeLeft / roundDuration) : 0f;
            timeFill.anchorMax = new Vector2(ratio, 1f);
            timeFillImage.color = ratio > 0.2f ? GoodColor : BadColor;
            scoreText.text = $"<size=48><color={StroopUIFactory.ToHex(TextSub)}>점수</color></size>  {score:N0}";
        }

        private void ShowFeedback(bool good)
        {
            feedbackText.text = good ? "O" : "X";
            feedbackText.color = good ? GoodColor : BadColor;
            if (feedbackAnim != null) StopCoroutine(feedbackAnim);
            feedbackAnim = StartCoroutine(FadeFeedback());
        }

        private IEnumerator FadeFeedback()
        {
            var rt = feedbackText.rectTransform;
            Color c = feedbackText.color;
            float t = 0f, dur = 0.35f;
            while (t < dur)
            {
                t += Time.deltaTime;
                float k = t / dur;
                rt.localScale = Vector3.one * Mathf.Lerp(0.7f, 1.15f, Mathf.Min(1f, k * 3f));
                c.a = 1f - Mathf.Clamp01((k - 0.4f) / 0.6f);
                feedbackText.color = c;
                yield return null;
            }
            feedbackText.text = "";
            feedbackAnim = null;
        }

        private static IEnumerator Punch(RectTransform target, float peak, float duration)
        {
            float t = 0f;
            while (t < duration)
            {
                t += Time.deltaTime;
                float k = Mathf.Clamp01(t / duration);
                float s = Mathf.Lerp(peak, 1f, 1f - (1f - k) * (1f - k)); // ease-out
                target.localScale = Vector3.one * s;
                yield return null;
            }
            target.localScale = Vector3.one;
        }

        private static IEnumerator Shake(RectTransform target, float duration, float strength)
        {
            target.localScale = Vector3.one;
            float t = 0f;
            while (t < duration)
            {
                t += Time.deltaTime;
                float damp = 1f - Mathf.Clamp01(t / duration);
                target.anchoredPosition = new Vector2(Mathf.Sin(t * 70f) * strength * damp, 0f);
                yield return null;
            }
            target.anchoredPosition = Vector2.zero;
        }

        private void SetOptionsVisible(bool visible)
        {
            foreach (var b in optionButtons) b.gameObject.SetActive(visible);
        }

        // ───────────────────────── UI 생성 ─────────────────────────

        private void BuildUI()
        {
            StroopUIFactory.EnsureEventSystem();
            Canvas canvas = StroopUIFactory.CreateCanvas("StroopCanvas");
            canvas.transform.SetParent(transform, false);
            Transform root = canvas.transform;

            StroopUIFactory.CreateImage("Background", root, BgColor).rectTransform.Stretch();

            BuildGamePanel(root);
            BuildTitlePanel(root);
            BuildResultPanel(root);
        }

        // 고령자용 레이아웃: 글자는 크게, 화면 요소는 최소로 (기준 해상도 1080x1920)
        private void BuildTitlePanel(Transform root)
        {
            titlePanel = StroopUIFactory.CreateRect("TitlePanel", root).Stretch();

            // 타이틀 자체를 스트룹 스타일로
            var title = StroopUIFactory.CreateText("Title", titlePanel, font,
                $"<color={Hx(0)}>색</color><color={Hx(1)}>깔</color>\n<color={Hx(2)}>헷</color><color={Hx(3)}>갈</color><color={Hx(1)}>림</color>",
                200, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            title.lineSpacing = 0.95f;
            title.rectTransform.Anchor(0, 0.7f, 1, 0.92f);

            var howto = StroopUIFactory.CreateText("HowTo", titlePanel, font,
                $"글자를 읽지 말고\n글자의 <color={StroopUIFactory.ToHex(Accent)}>색깔</color>을 누르세요",
                64, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            howto.lineSpacing = 1.2f;
            howto.rectTransform.Anchor(0.04f, 0.58f, 0.96f, 0.69f);

            // 예시 카드: 파란색 "빨강" → 정답은 파랑
            var example = StroopUIFactory.CreateImage("Example", titlePanel, CardColor);
            example.rectTransform.Anchor(0.08f, 0.38f, 0.92f, 0.56f);
            var exWord = StroopUIFactory.CreateText("ExampleWord", example.transform, font, palette[0].name, 150, palette[1].color, TextAnchor.MiddleCenter, FontStyle.Bold);
            exWord.rectTransform.Anchor(0, 0.38f, 1, 1);
            var exAnswer = StroopUIFactory.CreateText("ExampleAnswer", example.transform, font,
                $"정답은 <color={Hx(1)}><b>{palette[1].name}</b></color>", 64, TextDark);
            exAnswer.rectTransform.Anchor(0, 0.05f, 1, 0.38f);

            var start = StroopUIFactory.CreateButton("StartButton", titlePanel, font, "시작하기", 80, InkBadge, Color.white, out _);
            start.colors = DarkButtonColors(start.colors);
            ((RectTransform)start.transform).Anchor(0.08f, 0.22f, 0.92f, 0.32f);
            start.onClick.AddListener(StartGame);

            titleBestText = StroopUIFactory.CreateText("Best", titlePanel, font, "", 56, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            titleBestText.rectTransform.Anchor(0, 0.14f, 1, 0.2f);
        }

        private void BuildGamePanel(Transform root)
        {
            gamePanel = StroopUIFactory.CreateRect("GamePanel", root).Stretch();

            // 전체 남은 시간 바
            var barBg = StroopUIFactory.CreateImage("TimeBarBg", gamePanel, Hex("#D9D2C4"));
            barBg.rectTransform.Anchor(0.05f, 0.955f, 0.95f, 0.972f);
            var fill = StroopUIFactory.CreateImage("TimeBarFill", barBg.transform, GoodColor);
            timeFillImage = fill;
            timeFill = fill.rectTransform.Stretch();

            // 점수
            scoreText = StroopUIFactory.CreateText("Score", gamePanel, font, "0", 100, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            scoreText.rectTransform.Anchor(0, 0.88f, 1, 0.945f);

            // 지시문 (항상 같은 문구)
            instructionBadge = StroopUIFactory.CreateImage("Instruction", gamePanel, Color.clear);
            instructionBadge.rectTransform.Anchor(0.04f, 0.82f, 0.96f, 0.875f);
            instructionText = StroopUIFactory.CreateText("InstructionText", instructionBadge.transform, font,
                $"글자의 <color={StroopUIFactory.ToHex(Accent)}>색깔</color>을 누르세요", 66, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            instructionText.rectTransform.Stretch();

            // 단어 카드
            var cardHolder = StroopUIFactory.CreateRect("CardHolder", gamePanel).Anchor(0.05f, 0.47f, 0.95f, 0.81f);
            var card = StroopUIFactory.CreateImage("WordCard", cardHolder, CardColor);
            wordCard = card.rectTransform.Stretch();
            var cardShadow = card.gameObject.AddComponent<Shadow>();
            cardShadow.effectColor = new Color(0, 0, 0, 0.12f);
            cardShadow.effectDistance = new Vector2(0, -12);
            wordText = StroopUIFactory.CreateText("Word", wordCard, font, "", 300, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            wordText.rectTransform.Stretch();

            // 문제당 남은 시간 바 (카드 아래)
            var answerBg = StroopUIFactory.CreateImage("AnswerBarBg", gamePanel, Hex("#D9D2C4"));
            answerBg.rectTransform.Anchor(0.05f, 0.43f, 0.95f, 0.449f);
            answerFillImage = StroopUIFactory.CreateImage("AnswerBarFill", answerBg.transform, AnswerBarColor);
            answerFill = answerFillImage.rectTransform.Stretch();

            // 피드백 O/X
            feedbackText = StroopUIFactory.CreateText("Feedback", gamePanel, font, "", 460, GoodColor, TextAnchor.MiddleCenter, FontStyle.Bold);
            feedbackText.rectTransform.Anchor(0, 0.47f, 1, 0.81f);

            // 보기 버튼 2x2 (위치 고정)
            var grid = StroopUIFactory.CreateRect("Options", gamePanel).Anchor(0.04f, 0.04f, 0.96f, 0.41f);
            for (int i = 0; i < optionButtons.Length; i++)
            {
                int col = i % 2, row = i / 2;
                float x0 = col * 0.5f + 0.015f, x1 = col * 0.5f + 0.485f;
                float y1 = 1f - row * 0.5f - 0.025f, y0 = 1f - row * 0.5f - 0.475f;

                var btn = StroopUIFactory.CreateButton($"Option{i}", grid, font, "", 110, Color.white, TextDark, out Text label);
                ((RectTransform)btn.transform).Anchor(x0, y0, x1, y1);
                int captured = i;
                btn.onClick.AddListener(() => OnOptionClicked(captured));
                optionButtons[i] = btn;
                optionLabels[i] = label;
            }

            // 카운트다운
            countdownText = StroopUIFactory.CreateText("Countdown", gamePanel, font, "", 360, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            countdownText.rectTransform.Anchor(0, 0.47f, 1, 0.81f);
            countdownText.gameObject.SetActive(false);
        }

        private void BuildResultPanel(Transform root)
        {
            resultPanel = StroopUIFactory.CreateRect("ResultPanel", root).Stretch();

            cheerText = StroopUIFactory.CreateText("Cheer", resultPanel, font, "", 84, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            cheerText.rectTransform.Anchor(0, 0.84f, 1, 0.92f);

            var label = StroopUIFactory.CreateText("ScoreLabel", resultPanel, font, "점수", 60, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            label.rectTransform.Anchor(0, 0.78f, 1, 0.83f);

            resultScoreText = StroopUIFactory.CreateText("Score", resultPanel, font, "0", 230, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            resultScoreText.rectTransform.Anchor(0, 0.66f, 1, 0.78f);

            resultBestText = StroopUIFactory.CreateText("Best", resultPanel, font, "", 56, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            resultBestText.rectTransform.Anchor(0, 0.61f, 1, 0.66f);

            var box = StroopUIFactory.CreateImage("DetailBox", resultPanel, CardColor);
            box.rectTransform.Anchor(0.08f, 0.38f, 0.92f, 0.59f);
            resultDetailText = StroopUIFactory.CreateText("Detail", box.transform, font, "", 64, TextDark);
            resultDetailText.lineSpacing = 1.35f;
            resultDetailText.rectTransform.Stretch();

            var retry = StroopUIFactory.CreateButton("RetryButton", resultPanel, font, "다시 하기", 80, InkBadge, Color.white, out _);
            retry.colors = DarkButtonColors(retry.colors);
            ((RectTransform)retry.transform).Anchor(0.08f, 0.2f, 0.92f, 0.3f);
            retry.onClick.AddListener(StartGame);

            var home = StroopUIFactory.CreateButton("HomeButton", resultPanel, font, "처음으로", 64, Color.white, TextDark, out _);
            ((RectTransform)home.transform).Anchor(0.08f, 0.08f, 0.92f, 0.17f);
            home.onClick.AddListener(ShowTitle);
        }

        // ───────────────────────── 유틸 ─────────────────────────

        private static ColorBlock DarkButtonColors(ColorBlock c)
        {
            c.highlightedColor = new Color(0.9f, 0.9f, 0.9f);
            c.pressedColor = new Color(0.7f, 0.7f, 0.7f);
            return c;
        }

        private string Hx(int paletteIndex) => StroopUIFactory.ToHex(palette[paletteIndex].color);

        // 필드 초기화(직렬화 스레드)에서도 안전하도록 순수 C#으로 파싱
        private static Color Hex(string hex)
        {
            hex = hex.TrimStart('#');
            if (hex.Length != 6) return Color.magenta;
            int v = System.Convert.ToInt32(hex, 16);
            return new Color(((v >> 16) & 0xFF) / 255f, ((v >> 8) & 0xFF) / 255f, (v & 0xFF) / 255f, 1f);
        }
    }
}
