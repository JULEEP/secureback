import Freelancer from '../Models/Freelancer.js';
import jwt from 'jsonwebtoken';
import Client from '../Models/Client.js';
import Project from '../Models/Project.js';
import TeamMember from '../Models/TeamMember.js';
import Proposal from '../Models/Proposal.js';

export const registerFreelancer = async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      confirmPassword,
    } = req.body;

    // Validate required fields
    if (!name || !email || !mobile || !password || !confirmPassword) {
      return res.status(400).json({
        message: 'All fields are required: Name, Email, Mobile, Password, and Confirm Password!',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match!' });
    }

    const freelancerExists = await Freelancer.findOne({ $or: [{ email }, { mobile }] });
    if (freelancerExists) {
      return res.status(400).json({ message: 'Freelancer with this email or mobile already exists!' });
    }

    const newFreelancer = new Freelancer({
      name,
      email,
      mobile,
      password, // ⚠️ Still plain-text, you should hash it before production
    });

    await newFreelancer.save();

    const token = jwt.sign({ id: newFreelancer._id }, process.env.JWT_SECRET_KEY, {
      expiresIn: '1h',
    });

    return res.status(201).json({
      message: 'Freelancer registered successfully',
      token,
      freelancer: {
        id: newFreelancer._id,
        name: newFreelancer.name,
        email: newFreelancer.email,
        mobile: newFreelancer.mobile,
        createdAt: newFreelancer.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};



export const loginFreelancer = async (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
  
    try {
      const freelancer = await Freelancer.findOne({ email });
  
      if (!freelancer) {
        return res.status(404).json({ error: "Freelancer not found. Please register first." });
      }

  
      const token = jwt.sign(
        { id: freelancer._id },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '1h' }
      );
  
      return res.status(200).json({
        message: "Login successful",
        token,
        freelancer: {
          _id: freelancer._id,
          name: freelancer.name || null,
          email: freelancer.email || null,
          mobile: freelancer.mobile || null,
          skills: freelancer.skills || [],
          location: freelancer.location || null,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Something went wrong during login",
        details: err.message,
      });
    }
  };

  
  export const getFreelancer = async (req, res) => {
    try {
      const freelancerId = req.params.freelancerId;
  
      const freelancer = await Freelancer.findById(freelancerId);
  
      if (!freelancer) {
        return res.status(404).json({ message: 'Freelancer not found!' });
      }
  
      return res.status(200).json({
        message: 'Freelancer details retrieved successfully!',
        id: freelancer._id,
        name: freelancer.name,
        email: freelancer.email,
        mobile: freelancer.mobile,
        skills: freelancer.skills || [],
        location: freelancer.location || null,
        profileImage: freelancer.profileImage || 'default-profile-image.jpg',
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Server error' });
    }
  };
  



  export const createProject = async (req, res) => {
  const { freelancerId } = req.params;
  const {
    title,
    description,
    category,
    budget,
    deadline,
    attachments,
    clientId,
    assignedTo,
    status
  } = req.body;

  if (!title || !description || !budget || !clientId) {
    return res.status(400).json({
      message: 'Title, description, budget, and clientId are required',
    });
  }

  try {
    // 1. Create the project with assignedTo
    const newProject = new Project({
      title,
      description,
      category,
      budget,
      deadline,
      attachments,
      clientId,
      assignedFreelancer: freelancerId,
      assignedTo: assignedTo || [], // ✅ add assignedTo properly
      progress: 0,
      association: [],
      activity: [
        {
          action: 'Project created',
          by: `Freelancer ${freelancerId}`,
          timestamp: new Date(),
        }
      ],
      status: status || 'Pending',
    });

    const savedProject = await newProject.save();

    // 2. Push project ID into client's myProjects[]
    await Client.findByIdAndUpdate(clientId, {
      $push: { myProjects: savedProject._id },
    });

    // 3. Push project ID into each assigned team member's assignedProjects[]
    if (assignedTo && assignedTo.length > 0) {
      await TeamMember.updateMany(
        { _id: { $in: assignedTo } },
        { $push: { assignedProjects: savedProject._id } }
      );
    }

    return res.status(201).json({
      message: 'Project created successfully',
      project: savedProject,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error while creating project' });
  }
};


  export const getProjectsByFreelancer = async (req, res) => {
    const { freelancerId } = req.params;
  
    try {
      const projects = await Project.find({ assignedFreelancer: freelancerId }).sort({ createdAt: -1 });
  
      return res.status(200).json({
        message: 'Projects fetched successfully',
        projects,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Server error while fetching projects' });
    }
  };

  

  export const updateProject = async (req, res) => {
    const { freelancerId, projectId } = req.params;
  const {
    title,
    description,
    category,
    budget,
    deadline,
    attachments,
    assignedTo,
    status,
    progress
  } = req.body;

  try {
    const existingProject = await Project.findById(projectId);
    if (!existingProject) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // 1. Update team member references
    const oldAssignedTo = existingProject.assignedTo.map(id => id.toString());
    const newAssignedTo = assignedTo || [];

    // Remove project from old team members that are no longer assigned
    const removedMembers = oldAssignedTo.filter(id => !newAssignedTo.includes(id));
    if (removedMembers.length > 0) {
      await TeamMember.updateMany(
        { _id: { $in: removedMembers } },
        { $pull: { assignedProjects: projectId } }
      );
    }

    // Add project to newly assigned team members
    const addedMembers = newAssignedTo.filter(id => !oldAssignedTo.includes(id));
    if (addedMembers.length > 0) {
      await TeamMember.updateMany(
        { _id: { $in: addedMembers } },
        { $addToSet: { assignedProjects: projectId } }
      );
    }

    // 2. Update the project
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      {
        title,
        description,
        category,
        budget,
        deadline,
        attachments,
        assignedTo: newAssignedTo,
        status,
        progress,
        $push: {
          activity: {
            action: 'Project updated',
            by: `Freelancer ${freelancerId}`,
            timestamp: new Date(),
          }
        }
      },
      { new: true }
    );

    return res.status(200).json({
      message: 'Project updated successfully',
      project: updatedProject,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error updating project' });
  }
  };


// ✅ Create Client
export const createClient = async (req, res) => {
    const { freelancerId } = req.params;
    const {
      name, email, mobile, password,
      companyName, profileImage, address, bio, website, termsAndConditionsAgreed
    } = req.body;
  
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: 'Name, email, mobile, and password are required' });
    }
  
    try {
      const clientExist = await Client.findOne({ email });
  
      if (clientExist) {
        return res.status(400).json({ message: 'Client with this email already exists' });
      }
  
      const newClient = new Client({
        name,
        email,
        mobile,
        password,
        companyName,
        profileImage,
        address,
        bio,
        website,
        termsAndConditionsAgreed,
      });
  
      const savedClient = await newClient.save();
  
      res.status(201).json({
        message: 'Client created successfully',
        client: savedClient,
        byFreelancer: freelancerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error while creating client' });
    }
  };
  
  // ✅ Get All Clients (by a Freelancer)
  export const getClientsByFreelancer = async (req, res) => {
    const { freelancerId } = req.params;
  
    try {
      const clients = await Client.find(); // You can filter if needed
  
      res.status(200).json({
        message: 'Clients fetched successfully',
        clients,
        viewedBy: freelancerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error fetching clients' });
    }
  };
  
  // ✅ Get Single Client
  export const getSingleClient = async (req, res) => {
    const { freelancerId, clientId } = req.params;
  
    try {
      const client = await Client.findById(clientId);
  
      if (!client) {
        return res.status(404).json({ message: 'Client not found' });
      }
  
      res.status(200).json({
        message: 'Client fetched successfully',
        client,
        viewedBy: freelancerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error fetching client' });
    }
  };
  
  // ✅ Update Client
  export const updateClient = async (req, res) => {
    const { freelancerId, clientId } = req.params;
  
    try {
      const updatedClient = await Client.findByIdAndUpdate(clientId, req.body, {
        new: true,
      });
  
      if (!updatedClient) {
        return res.status(404).json({ message: 'Client not found' });
      }
  
      res.status(200).json({
        message: 'Client updated successfully',
        updatedClient,
        updatedBy: freelancerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error updating client' });
    }
  };
  
  // ✅ Delete Client
  export const deleteClient = async (req, res) => {
    const { freelancerId, clientId } = req.params;
  
    try {
      const deletedClient = await Client.findByIdAndDelete(clientId);
  
      if (!deletedClient) {
        return res.status(404).json({ message: 'Client not found' });
      }
  
      res.status(200).json({
        message: 'Client deleted successfully',
        deletedClient,
        deletedBy: freelancerId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error deleting client' });
    }
  };



// ✅ Create Team Member
export const createTeamMember = async (req, res) => {
  const { freelancerId } = req.params;
  const {
    name, email, role, projects, status,
    bio, profileImage, mobile
  } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ message: 'Name, email, and role are required' });
  }

  try {
    const memberExist = await TeamMember.findOne({ email });

    if (memberExist) {
      return res.status(400).json({ message: 'Team member with this email already exists' });
    }

    const newMember = new TeamMember({
      name,
      email,
      role,
      projects,
      status,
      bio,
      profileImage,
      mobile,
    });

    const savedMember = await newMember.save();

    res.status(201).json({
      message: 'Team member created successfully',
      teamMember: savedMember,
      addedBy: freelancerId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error while creating team member' });
  }
};

// ✅ Get All Team Members
export const getAllTeamMembers = async (req, res) => {
  const { freelancerId } = req.params;

  try {
    const members = await TeamMember.find();

    res.status(200).json({
      message: 'Team members fetched successfully',
      members,
      viewedBy: freelancerId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching team members' });
  }
};

// ✅ Get Single Team Member
export const getSingleTeamMember = async (req, res) => {
  const { freelancerId, memberId } = req.params;

  try {
    const member = await TeamMember.findById(memberId);

    if (!member) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    res.status(200).json({
      message: 'Team member fetched successfully',
      member,
      viewedBy: freelancerId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching team member' });
  }
};

// ✅ Update Team Member
export const updateTeamMember = async (req, res) => {
  const { freelancerId, memberId } = req.params;

  try {
    const updatedMember = await TeamMember.findByIdAndUpdate(memberId, req.body, {
      new: true,
    });

    if (!updatedMember) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    res.status(200).json({
      message: 'Team member updated successfully',
      updatedMember,
      updatedBy: freelancerId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating team member' });
  }
};

// ✅ Delete Team Member
export const deleteTeamMember = async (req, res) => {
  const { freelancerId, memberId } = req.params;

  try {
    const deletedMember = await TeamMember.findByIdAndDelete(memberId);

    if (!deletedMember) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    res.status(200).json({
      message: 'Team member deleted successfully',
      deletedMember,
      deletedBy: freelancerId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting team member' });
  }
};
  


export const createProposal = async (req, res) => {
  const {
    clientId,
    projectId,
    overview,
    scopeOfWork,
    startTime,
    endTime,
    totalAmount,
    termsAndConditions,
    status
  } = req.body;


  try {
    const newProposal = new Proposal({
      clientId,
      projectId,
      overview,
      scopeOfWork,
      startTime,
      endTime,
      totalAmount,
      termsAndConditions,
      status: status || 'Pending'
    });

    const savedProposal = await newProposal.save();

    return res.status(201).json({
      message: 'Proposal created successfully',
      proposal: savedProposal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while creating proposal' });
  }
};


export const getAllProposals = async (req, res) => {
  const { freelancerId } = req.params;

  try {
    const proposals = await Proposal.find()
      .populate('clientId', 'name email')
      .populate('projectId', 'title description');

    return res.status(200).json({
      message: 'Proposals fetched successfully',
      proposals,
      viewedBy: freelancerId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching proposals' });
  }
};


export const getProposalById = async (req, res) => {
  const { proposalId, freelancerId } = req.params;

  try {
    const proposal = await Proposal.findById(proposalId)
      .populate('clientId', 'name email')
      .populate('projectId', 'title description');

    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }

    return res.status(200).json({
      message: 'Proposal fetched successfully',
      proposal,
      viewedBy: freelancerId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching proposal' });
  }
};



