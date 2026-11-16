using System;
using System.Collections.Generic;
using UnityEngine;

namespace StroopMiniGame
{
    /// <summary>무엇을 맞혀야 하는지: 글자의 잉크 색 / 글자가 뜻하는 색</summary>
    public enum QuestionType
    {
        InkColor,
        Meaning
    }

    [Serializable]
    public struct StroopColor
    {
        public string name;
        public Color color;

        public StroopColor(string name, Color color)
        {
            this.name = name;
            this.color = color;
        }
    }

    /// <summary>한 문제의 데이터. 모든 값은 팔레트 인덱스.</summary>
    public class StroopQuestion
    {
        public int wordIndex;          // 화면에 쓰인 단어 (예: "빨강")
        public int inkIndex;           // 단어를 칠한 색 (예: 파랑)
        public QuestionType type;
        public int answerIndex;        // 정답 색
        public int[] options;          // 버튼별 색 인덱스
        public int[] optionLabelInk;   // 버튼 글자 색 (-1 = 기본색). 고레벨 방해 요소

        public bool IsCongruent => wordIndex == inkIndex;
    }

    /// <summary>레벨별 난이도 설정</summary>
    public struct LevelSettings
    {
        public int colorCount;          // 사용할 색 개수
        public float meaningChance;     // "뜻" 문제가 나올 확률
        public float congruentChance;   // 단어와 잉크 색이 같을 확률
        public bool buttonInterference; // 버튼 글자에도 다른 색 입히기
        public float answerTimeLimit;   // 한 문제에 답할 수 있는 시간(초)

        // 고령자도 플레이할 수 있도록 색은 4가지 고정, "색깔" 문제만.
        // 난이도는 문제당 답할 수 있는 시간으로만 조절: Lv.1 5초 → 레벨마다 -0.5초 → 최소 2초
        public const int ColorCount = 4;
        public const float StartAnswerTime = 5f;
        public const float AnswerTimeStep = 0.5f;
        public const float MinAnswerTime = 2f;

        public static int MaxLevel => 1 + Mathf.RoundToInt((StartAnswerTime - MinAnswerTime) / AnswerTimeStep);

        public static LevelSettings For(int level, int paletteCount)
        {
            return new LevelSettings
            {
                colorCount = Mathf.Clamp(ColorCount, 2, paletteCount),
                meaningChance = 0f,
                congruentChance = 0.2f,
                buttonInterference = false,
                answerTimeLimit = Mathf.Max(MinAnswerTime, StartAnswerTime - AnswerTimeStep * Mathf.Max(0, level - 1)),
            };
        }
    }

    /// <summary>문제 생성기 (MonoBehaviour와 분리된 순수 로직)</summary>
    public class StroopGenerator
    {
        public const int OptionCount = 4;

        private readonly System.Random rng;
        private StroopQuestion last;

        public StroopGenerator(int? seed = null)
        {
            rng = seed.HasValue ? new System.Random(seed.Value) : new System.Random();
        }

        public void Reset() => last = null;

        public StroopQuestion Next(int level, int paletteCount)
        {
            LevelSettings s = LevelSettings.For(level, paletteCount);
            int n = s.colorCount;

            // 1) 단어 & 잉크 색 (직전 문제와 완전히 같은 조합은 피함)
            int word, ink, guard = 0;
            do
            {
                word = rng.Next(n);
                ink = rng.NextDouble() < s.congruentChance ? word : RandomExcept(n, word);
            } while (last != null && last.wordIndex == word && last.inkIndex == ink && ++guard < 20);

            var q = new StroopQuestion
            {
                wordIndex = word,
                inkIndex = ink,
                type = rng.NextDouble() < s.meaningChance ? QuestionType.Meaning : QuestionType.InkColor
            };
            q.answerIndex = q.type == QuestionType.InkColor ? ink : word;

            // 2) 보기: 정답 + "함정"(반대 속성 색) + 나머지 랜덤
            int optionCount = Mathf.Min(OptionCount, n);
            var options = new List<int>(optionCount) { q.answerIndex };
            if (!q.IsCongruent)
            {
                int trap = q.type == QuestionType.InkColor ? word : ink;
                options.Add(trap);
            }
            while (options.Count < optionCount)
            {
                int c = rng.Next(n);
                if (!options.Contains(c)) options.Add(c);
            }
            // 버튼 위치 고정: 팔레트 순서대로 정렬 (빨강·파랑 / 초록·노랑)
            options.Sort();
            q.options = options.ToArray();

            // 3) 버튼 글자 방해 색
            q.optionLabelInk = new int[q.options.Length];
            for (int i = 0; i < q.options.Length; i++)
                q.optionLabelInk[i] = s.buttonInterference ? RandomExcept(n, q.options[i]) : -1;

            last = q;
            return q;
        }

        private int RandomExcept(int n, int except)
        {
            if (n <= 1) return 0;
            int v = rng.Next(n - 1);
            return v >= except ? v + 1 : v;
        }

    }

    /// <summary>점수 규칙</summary>
    public static class StroopScoring
    {
        public const int BaseScore = 100;
        public const int ComboStep = 10;
        public const int MaxComboBonusSteps = 10;

        public static int ForCorrect(int comboAfter, float reactionSeconds)
        {
            int combo = Mathf.Min(comboAfter - 1, MaxComboBonusSteps) * ComboStep;
            int speed = reactionSeconds < 0.8f ? 50 : reactionSeconds < 1.2f ? 30 : reactionSeconds < 1.8f ? 10 : 0;
            return BaseScore + Mathf.Max(0, combo) + speed;
        }
    }
}
