const isAdmin = async (req, res, next) => {
  const userEmail = req.decoded?.email;
  console.log('user email is ',userEmail)

  if (userEmail === 'shahin@gmail.com') {
    return next(); // allow access
  }

  return res.status(403).send('Forbidden: Only Shahin can access this');
};

module.exports = isAdmin;
