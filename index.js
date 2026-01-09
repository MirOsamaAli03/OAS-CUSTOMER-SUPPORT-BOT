import cors from 'cors'; // At the very top

// ... inside your app setup ...
app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views')); 

// ADD THE DASHBOARD ROUTE
app.get('/dashboard', async (req, res) => {
  try {
    const needsAttention = await analyzed.find({ attention: true });
    const allGroups = await User.distinct("group_name");
    res.render('index', { needsAttention, allGroups });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});