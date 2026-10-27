using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Fixture ScriptableObject for <see cref="AssetSetPropertiesToolTests"/>. Lives in its own
    /// file (name matches the class) so Unity can save it as a .asset with a valid script ref.
    /// </summary>
    internal sealed class AssetSetPropertiesTestAsset : ScriptableObject
    {
        internal enum Mode { Idle, Patrol, Chase }

        [Serializable]
        internal struct Stats
        {
            public int hp;
            public float speed;
        }

        public int count;
        public string label;
        public Vector3 offset;
        public Mode mode;
        public Stats stats;
        public List<int> items = new List<int>();
        public UnityEngine.Object reference;
        [SerializeField] private bool _hidden;

        public bool Hidden => _hidden;
    }
}
