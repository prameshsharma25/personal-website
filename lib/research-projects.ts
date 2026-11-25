export type ProjectKind = 'bri' | 'caat' | 'amyloid' | 'ammper';

export type ResearchProject = {
  id: ProjectKind;
  name: string;
  field: string;
  status: 'Ongoing' | 'NASA Research';
  question: string;
  description: string;
  methods: string[];
  link: { label: string; url: string };
  steps: { label: string; description: string; visual: string }[];
};

export const researchProjects: ResearchProject[] = [
  {
    id: 'bri',
    name: 'Backbone Geometry & Structural Clustering',
    field: 'Protein Structure Analysis',
    status: 'Ongoing',
    question:
      'When thousands of models disagree, which shapes keep coming back?',
    description:
      'I’m building a pipeline that uses Backbone Rigid Invariants to compare protein structures and group similar conformations. It turns a large prediction ensemble into structural clusters and representative models that are easier to inspect.',
    methods: ['Backbone Rigid Invariants', 'HDBSCAN', 'Structural Medoids'],
    link: {
      label: 'Backbone Invariant Method',
      url: 'https://github.com/AAAAAkki/Backbone_invariant-public_release',
    },
    steps: [
      {
        label: 'Encode Geometry',
        description:
          'A protein’s position or orientation should not change how we describe its shape. Backbone Rigid Invariants encode geometry without depending on those rigid motions.',
        visual:
          'The same RfaH molecular structure rotating in three dimensions leads to the same schematic geometry descriptor.',
      },
      {
        label: 'Compare Models',
        description:
          'Compare the invariant representations of the models to build a pairwise distance matrix. This becomes the input to clustering.',
        visual:
          'A schematic symmetric distance matrix compares models, with blocks of similar structures.',
      },
      {
        label: 'Find Clusters',
        description:
          'HDBSCAN groups models using those distances, while leaving outliers unassigned. The clustering does not require known reference folds.',
        visual:
          'Illustrative model points gather into three colored groups, with outliers left outside the clusters. Positions are schematic, not a computed embedding.',
      },
      {
        label: 'Choose Representatives',
        description:
          'Select a structural medoid from each group. An optional Kabsch-alignment step compares medoids to consolidate closely related clusters.',
        visual:
          'One representative model is ringed in each cluster; these medoids make the ensemble easier to review.',
      },
    ],
  },
  {
    id: 'caat',
    name: 'CAAT & Attention-Guided Mutagenesis',
    field: 'Interpreting AlphaFold',
    status: 'Ongoing',
    question: 'Which residues change the structure AlphaFold predicts?',
    description:
      'With CAAT, I examine AlphaFold’s attention patterns to understand which residues matter to the model. I’m using that information to guide mutation tests and investigate proteins that may adopt more than one fold.',
    methods: ['AlphaFold Attention', 'In Silico Mutagenesis', 'Fold Switching'],
    link: {
      label: 'Explore CAAT',
      url: 'https://github.com/prameshsharma25/CAAT',
    },
    steps: [
      {
        label: 'Read Attention',
        description:
          'Extract attention from AlphaFold and examine the patterns across residues, layers, and heads. These patterns describe the model’s behavior, not physical interactions by themselves.',
        visual:
          'An illustrative residue-by-residue attention map highlights a few columns of stronger attention.',
      },
      {
        label: 'Prioritize Residues',
        description:
          'Summarize attention and compare patterns between predictions to identify positions worth testing. Attention supplies a hypothesis about the model, rather than a verdict about the protein.',
        visual:
          'A schematic attention profile highlights three candidate sequence positions for investigation.',
      },
      {
        label: 'Test Mutations',
        description:
          'Change selected amino acids in silico and generate new predictions. Comparing variants with the starting sequence helps test how sensitive the predicted fold is to those changes.',
        visual:
          'Three positions change in an illustrative sequence, producing a variant to test. This sequence is not an experimental result.',
      },
      {
        label: 'Compare Folds',
        description:
          'Compare the resulting structures to look for changes in the predicted fold. RfaH’s two reference structures illustrate what distinct folds can look like; they are not the outcome of the mutations shown here.',
        visual:
          'Shaded molecular cartoons of RfaH illustrate two reference folds: the alpha-helical hairpin from PDB 2OUG and the beta-barrel from PDB 2LCL.',
      },
    ],
  },
  {
    id: 'amyloid',
    name: 'Searching For Amyloid Structures',
    field: 'Collaborative Research',
    status: 'Ongoing',
    question: 'Which predicted assemblies deserve a closer look?',
    description:
      'I’m working with Dr. Devlina Chakravarty and Dr. Lauren Porter on ways to sort through predicted amyloid assemblies. We combine structural evidence with clustering to build a diverse shortlist of candidates for further review.',
    methods: ['Assembly Geometry', 'MM-align', 'Candidate Selection'],
    link: {
      label: 'Explore Amyloid Candidates',
      url: 'https://github.com/DevlinaC/Amyloid_Candidates',
    },
    steps: [
      {
        label: 'Collect Predictions',
        description:
          'Start with a pool of predicted assemblies for the same target. Different prediction methods and settings can produce many competing models.',
        visual:
          'Molecular cartoons of three experimental amyloid references illustrate the geometry of fibril assemblies. These are reference examples, not project predictions.',
      },
      {
        label: 'Assess Structure',
        description:
          'Examine assembly geometry, interface packing, and energetic evidence. Keep model confidence separate so it does not stand in for structural plausibility.',
        visual:
          'A three-dimensional amyloid reference is examined alongside geometry, packing, and energetics. Model confidence is shown separately.',
      },
      {
        label: 'Group Similar Models',
        description:
          'Compare models within a target using MM-align distances and HDBSCAN. Clusters expose repeated structural solutions and help avoid a shortlist filled with near-duplicates.',
        visual:
          'Reference assembly images illustrate three schematic groups according to structural similarity.',
      },
      {
        label: 'Review A Shortlist',
        description:
          'Bring structural evidence, confidence, and cluster centrality together to select diverse candidates for review. A high rank does not establish that a structure is correct or that a protein forms amyloid.',
        visual:
          'One reference assembly illustration from each of three schematic groups is selected for a diverse review shortlist.',
      },
    ],
  },
  {
    id: 'ammper',
    name: 'AMMPER: Microbial Life Under Radiation',
    field: 'NASA Ames / Space Biology',
    status: 'NASA Research',
    question:
      'How does radiation damage to a single cell change an entire population?',
    description:
      'At NASA Ames, I worked on AMMPER, an agent-based model of microbial populations exposed to radiation. I helped translate radiobiology findings into simulations of cell behavior and viability, connecting events at the scale of individual yeast cells to changes across a growing population.',
    methods: ['Agent-Based Modeling', 'Space Radiobiology', 'Microbial Growth'],
    link: {
      label: 'Explore AMMPER At NASA',
      url: 'https://github.com/nasa/AMMPER',
    },
    steps: [
      {
        label: 'Build A Population',
        description:
          'Represent each yeast cell as an individual agent in a three-dimensional environment. Cells grow and divide, so the population changes over time.',
        visual:
          'A schematic three-dimensional culture of budding yeast cells. Each cell represents an individual simulated agent.',
      },
      {
        label: 'Trace Radiation',
        description:
          'Introduce spatial radiation tracks from NASA’s RITRACKS data. Energy deposits and reactive oxygen species create uneven exposure across the population.',
        visual:
          'Radiation tracks pass through a schematic yeast population, with small points illustrating energy deposits near individual cells.',
      },
      {
        label: 'Follow Cell Fates',
        description:
          'Track damage, repair, division, and death at the cell level. Different histories for individual cells can produce different population-level outcomes.',
        visual:
          'Some illustrative cells remain viable, some show damage, and others stop dividing. These are conceptual states, not results from a simulation run.',
      },
      {
        label: 'Read The Response',
        description:
          'Connect cell-level behavior to growth and metabolic activity. AMMPER also models the blue-to-pink-to-clear response of alamarBlue, a dye used in microbial experiments.',
        visual:
          'An illustrative population growth curve and blue, pink, and clear dye samples connect cell behavior to observable readouts. No measured data are plotted.',
      },
    ],
  },
];
