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
        [SerializeField] private int maxLevel = 5;
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
            new StroopColor("보라", Hex("#8E3CC8")),
            new StroopColor("검정", Hex("#222222")),
        };

        private const string BestScoreKey = "StroopGame.BestScore";

        // 테마
        private static readonly Color BgColor = Hex("#F3F0E8");
        private static readonly Color TextDark = Hex("#2B2B2B");
        private static readonly Color TextSub = Hex("#7A746A");
        private static readonly Color CardColor = Color.white;
        private static readonly Color InkBadge = Hex("#2B2B2B");
        private static readonly Color MeaningBadge = Hex("#E8682B");
        private static readonly Color GoodColor = Hex("#2E9E44");
        private static readonly Color BadColor = Hex("#E53935");

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
        private Text scoreText, comboText, levelText, timeText;
        private Image instructionBadge;
        private Text instructionText, wordText, countdownText, feedbackText;
        private Text resultScoreText, resultBestText, resultDetailText, titleBestText;
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
            UpdateHud();
        }

        // ───────────────────────── 흐름 ─────────────────────────

        private void ShowTitle()
        {
            state = State.Title;
            titlePanel.gameObject.SetActive(true);
            gamePanel.gameObject.SetActive(false);
            resultPanel.gameObject.SetActive(false);
            titleBestText.text = bestScore > 0 ? $"최고 기록  {bestScore:N0}" : "";
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

            // 지시문
            bool ink = question.type == QuestionType.InkColor;
            instructionBadge.color = ink ? InkBadge : MeaningBadge;
            instructionText.text = ink ? "글자의 <b>색깔</b>을 고르세요" : "글자의 <b>뜻</b>을 고르세요";

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
            inputLocked = true;

            float rt = Time.time - questionShownAt;
            bool isCorrect = question.options[buttonIndex] == question.answerIndex;

            if (isCorrect)
            {
                correct++;
                combo++;
                maxCombo = Mathf.Max(maxCombo, combo);
                reactionSum += rt;
                score += StroopScoring.ForCorrect(combo, rt);
                level = Mathf.Min(maxLevel, 1 + correct / Mathf.Max(1, correctPerLevel));
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

            resultScoreText.text = $"{score:N0}";
            resultBestText.text = newBest && score > 0
                ? $"<color={StroopUIFactory.ToHex(MeaningBadge)}>신기록!</color>"
                : $"최고 기록  {bestScore:N0}";
            resultDetailText.text =
                $"정답  {correct} / {total}\n" +
                $"정확도  {accuracy:0}%\n" +
                $"평균 반응 속도  {avgRt:0.00}초\n" +
                $"최대 콤보  {maxCombo}";

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
            timeText.text = Mathf.CeilToInt(timeLeft).ToString();

            scoreText.text = $"{score:N0}";
            comboText.text = combo >= 2 ? $"{combo} COMBO" : "";
            levelText.text = $"Lv.{level}";
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

        private void BuildTitlePanel(Transform root)
        {
            titlePanel = StroopUIFactory.CreateRect("TitlePanel", root).Stretch();

            // 타이틀 자체를 스트룹 스타일로
            var title = StroopUIFactory.CreateText("Title", titlePanel, font,
                $"<color={Hx(0)}>색</color><color={Hx(1)}>깔</color> <color={Hx(2)}>헷</color><color={Hx(3)}>갈</color><color={Hx(Mathf.Min(4, palette.Count - 1))}>림</color>",
                150, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            title.rectTransform.Anchor(0, 0.66f, 1, 0.8f);

            var sub = StroopUIFactory.CreateText("Subtitle", titlePanel, font, "STROOP TEST", 48, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            sub.rectTransform.Anchor(0, 0.6f, 1, 0.65f);

            var rules = StroopUIFactory.CreateText("Rules", titlePanel, font,
                "지시문을 잘 보고 답하세요!\n\n" +
                "<b>색깔</b>  →  글자가 칠해진 색\n" +
                "<b>뜻</b>  →  글자가 의미하는 색\n\n" +
                $"제한 시간 {roundDuration:0}초 · 오답 시 -{wrongPenaltySeconds:0.#}초",
                46, TextDark);
            rules.lineSpacing = 1.15f;
            rules.rectTransform.Anchor(0.08f, 0.36f, 0.92f, 0.56f);

            var start = StroopUIFactory.CreateButton("StartButton", titlePanel, font, "시작하기", 64, InkBadge, Color.white, out _);
            start.colors = DarkButtonColors(start.colors);
            ((RectTransform)start.transform).Anchor(0.18f, 0.2f, 0.82f, 0.28f);
            start.onClick.AddListener(StartGame);

            titleBestText = StroopUIFactory.CreateText("Best", titlePanel, font, "", 40, TextSub);
            titleBestText.rectTransform.Anchor(0, 0.13f, 1, 0.18f);
        }

        private void BuildGamePanel(Transform root)
        {
            gamePanel = StroopUIFactory.CreateRect("GamePanel", root).Stretch();

            // 상단 HUD
            var hud = StroopUIFactory.CreateRect("HUD", gamePanel).Anchor(0.06f, 0.88f, 0.94f, 0.96f);
            levelText = StroopUIFactory.CreateText("Level", hud, font, "Lv.1", 44, TextSub, TextAnchor.MiddleLeft, FontStyle.Bold);
            levelText.rectTransform.Anchor(0, 0, 0.3f, 1);
            scoreText = StroopUIFactory.CreateText("Score", hud, font, "0", 84, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            scoreText.rectTransform.Anchor(0.25f, 0, 0.75f, 1);
            timeText = StroopUIFactory.CreateText("Time", hud, font, "", 44, TextSub, TextAnchor.MiddleRight, FontStyle.Bold);
            timeText.rectTransform.Anchor(0.7f, 0, 1, 1);

            // 시간 바
            var barBg = StroopUIFactory.CreateImage("TimeBarBg", gamePanel, Hex("#DDD7CB"));
            barBg.rectTransform.Anchor(0.06f, 0.865f, 0.94f, 0.877f);
            var fill = StroopUIFactory.CreateImage("TimeBarFill", barBg.transform, GoodColor);
            timeFillImage = fill;
            timeFill = fill.rectTransform.Stretch();

            comboText = StroopUIFactory.CreateText("Combo", gamePanel, font, "", 46, MeaningBadge, TextAnchor.MiddleCenter, FontStyle.Bold);
            comboText.rectTransform.Anchor(0, 0.81f, 1, 0.85f);

            // 지시문 뱃지
            instructionBadge = StroopUIFactory.CreateImage("InstructionBadge", gamePanel, InkBadge);
            instructionBadge.rectTransform.Anchor(0.14f, 0.72f, 0.86f, 0.79f);
            instructionText = StroopUIFactory.CreateText("Instruction", instructionBadge.transform, font, "", 56, Color.white);
            instructionText.rectTransform.Stretch();

            // 단어 카드
            var cardHolder = StroopUIFactory.CreateRect("CardHolder", gamePanel).Anchor(0.08f, 0.44f, 0.92f, 0.69f);
            var card = StroopUIFactory.CreateImage("WordCard", cardHolder, CardColor);
            wordCard = card.rectTransform.Stretch();
            var cardShadow = card.gameObject.AddComponent<Shadow>();
            cardShadow.effectColor = new Color(0, 0, 0, 0.12f);
            cardShadow.effectDistance = new Vector2(0, -12);
            wordText = StroopUIFactory.CreateText("Word", wordCard, font, "", 210, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            wordText.rectTransform.Stretch();

            // 피드백 O/X
            feedbackText = StroopUIFactory.CreateText("Feedback", gamePanel, font, "", 420, GoodColor, TextAnchor.MiddleCenter, FontStyle.Bold);
            feedbackText.rectTransform.Anchor(0, 0.44f, 1, 0.69f);

            // 보기 버튼 2x2
            var grid = StroopUIFactory.CreateRect("Options", gamePanel).Anchor(0.06f, 0.06f, 0.94f, 0.38f);
            for (int i = 0; i < optionButtons.Length; i++)
            {
                int col = i % 2, row = i / 2;
                float x0 = col * 0.5f + 0.02f, x1 = col * 0.5f + 0.48f;
                float y1 = 1f - row * 0.5f - 0.03f, y0 = 1f - row * 0.5f - 0.47f;

                var btn = StroopUIFactory.CreateButton($"Option{i}", grid, font, "", 88, Color.white, TextDark, out Text label);
                ((RectTransform)btn.transform).Anchor(x0, y0, x1, y1);
                int captured = i;
                btn.onClick.AddListener(() => OnOptionClicked(captured));
                optionButtons[i] = btn;
                optionLabels[i] = label;
            }

            // 카운트다운
            countdownText = StroopUIFactory.CreateText("Countdown", gamePanel, font, "", 320, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            countdownText.rectTransform.Anchor(0, 0.44f, 1, 0.69f);
            countdownText.gameObject.SetActive(false);
        }

        private void BuildResultPanel(Transform root)
        {
            resultPanel = StroopUIFactory.CreateRect("ResultPanel", root).Stretch();

            var head = StroopUIFactory.CreateText("Head", resultPanel, font, "결과", 64, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            head.rectTransform.Anchor(0, 0.8f, 1, 0.86f);

            resultScoreText = StroopUIFactory.CreateText("Score", resultPanel, font, "0", 200, TextDark, TextAnchor.MiddleCenter, FontStyle.Bold);
            resultScoreText.rectTransform.Anchor(0, 0.66f, 1, 0.8f);

            resultBestText = StroopUIFactory.CreateText("Best", resultPanel, font, "", 50, TextSub, TextAnchor.MiddleCenter, FontStyle.Bold);
            resultBestText.rectTransform.Anchor(0, 0.61f, 1, 0.66f);

            var box = StroopUIFactory.CreateImage("DetailBox", resultPanel, CardColor);
            box.rectTransform.Anchor(0.12f, 0.36f, 0.88f, 0.58f);
            resultDetailText = StroopUIFactory.CreateText("Detail", box.transform, font, "", 50, TextDark);
            resultDetailText.lineSpacing = 1.3f;
            resultDetailText.rectTransform.Stretch();

            var retry = StroopUIFactory.CreateButton("RetryButton", resultPanel, font, "다시 하기", 64, InkBadge, Color.white, out _);
            retry.colors = DarkButtonColors(retry.colors);
            ((RectTransform)retry.transform).Anchor(0.18f, 0.2f, 0.82f, 0.28f);
            retry.onClick.AddListener(StartGame);

            var home = StroopUIFactory.CreateButton("HomeButton", resultPanel, font, "처음으로", 52, Color.white, TextDark, out _);
            ((RectTransform)home.transform).Anchor(0.3f, 0.11f, 0.7f, 0.17f);
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
